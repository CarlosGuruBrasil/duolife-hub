import { NextRequest } from 'next/server';
import { verifyAuth, isInternalUser, unauthorized, getPartnerAccessContext } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { parseJsonbField } from '@/lib/json-safe';

function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

function inferDocumentType(documentNumber: string): 'cpf' | 'cnpj' {
  return documentNumber.length > 11 ? 'cnpj' : 'cpf';
}

function parseBirthDateInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  let y: string, m: string, d: string;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    [d, m, y] = trimmed.split('/');
  } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    [y, m, d] = trimmed.slice(0, 10).split('-');
  } else {
    return null;
  }

  const yearNum = parseInt(y, 10);
  const monthNum = parseInt(m, 10);
  const dayNum = parseInt(d, 10);
  if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) return null;
  if (yearNum < 1900 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }

  return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await verifyAuth();
    if (!user) return unauthorized();

    const isAdmin = isInternalUser(user);
    const access = isAdmin ? null : await getPartnerAccessContext(user);

    if (!isAdmin && !access) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Se parceiro, valida se o cliente possui cotações acessíveis
    if (!isAdmin && access) {
      let hasAccess = false;
      if (access.visibleUserIds === null) {
        const [row] = await sql`
          SELECT 1 FROM cotacoes
          WHERE client_id = ${id} AND partner_id = ${access.partnerId}
          LIMIT 1
        `;
        hasAccess = !!row;
      } else if (access.visibleUserIds.length > 0) {
        const [row] = await sql`
          SELECT 1 FROM cotacoes
          WHERE client_id = ${id}
            AND partner_id = ${access.partnerId}
            AND (partner_user_id IN ${sql(access.visibleUserIds)} OR partner_user_id IS NULL)
          LIMIT 1
        `;
        hasAccess = !!row;
      }

      if (!hasAccess) {
        return Response.json({ error: 'Cliente não encontrado ou acesso negado' }, { status: 404 });
      }
    }

    const [client] = await sql`
      SELECT
        id,
        document_number,
        document_type,
        full_name,
        email,
        phone,
        birth_date,
        metadata,
        created_at,
        updated_at
      FROM insurance_clients
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!client) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Extrai endereço do metadata ou da cotação mais recente do cliente como fallback seguro
    const metadata = parseJsonbField<Record<string, unknown>>(client.metadata);
    const metaAddress = (metadata.address && typeof metadata.address === 'object' && !Array.isArray(metadata.address))
      ? (metadata.address as Record<string, unknown>)
      : null;

    const [latestQuote] = await sql`
      SELECT client_data
      FROM cotacoes
      WHERE client_id = ${id}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const latestClientData = latestQuote ? parseJsonbField<Record<string, unknown>>(latestQuote.client_data) : {};

    const address = {
      cep: String(metaAddress?.cep || latestClientData.cep || ''),
      logradouro: String(metaAddress?.logradouro || latestClientData.logradouro || latestClientData.rua || ''),
      numero: String(metaAddress?.numero || latestClientData.numero || ''),
      complemento: String(metaAddress?.complemento || latestClientData.complemento || ''),
      bairro: String(metaAddress?.bairro || latestClientData.bairro || ''),
      cidade: String(metaAddress?.cidade || latestClientData.cidade || ''),
      uf: String(metaAddress?.uf || latestClientData.uf || ''),
    };

    // Retorna cotações vinculadas ao cliente para facilitar exibição
    let cotacoes;
    if (isAdmin) {
      cotacoes = await sql`
        SELECT
          c.*,
          p.name AS product_name,
          p.flow_key AS product_flow_key,
          part.nome_fantasia AS partner_name,
          part.razao_social AS partner_razao_social
        FROM cotacoes c
        LEFT JOIN products p ON p.id = c.product_id
        LEFT JOIN partners part ON part.id = c.partner_id
        WHERE c.client_id = ${id}
        ORDER BY c.created_at DESC
      `;
    } else if (access) {
      if (access.visibleUserIds === null) {
        cotacoes = await sql`
          SELECT
            c.*,
            p.name AS product_name,
            p.flow_key AS product_flow_key,
            part.nome_fantasia AS partner_name,
            part.razao_social AS partner_razao_social
          FROM cotacoes c
          LEFT JOIN products p ON p.id = c.product_id
          LEFT JOIN partners part ON part.id = c.partner_id
          WHERE c.client_id = ${id}
            AND c.partner_id = ${access.partnerId}
          ORDER BY c.created_at DESC
        `;
      } else {
        cotacoes = await sql`
          SELECT
            c.*,
            p.name AS product_name,
            p.flow_key AS product_flow_key,
            part.nome_fantasia AS partner_name,
            part.razao_social AS partner_razao_social
          FROM cotacoes c
          LEFT JOIN products p ON p.id = c.product_id
          LEFT JOIN partners part ON part.id = c.partner_id
          WHERE c.client_id = ${id}
            AND c.partner_id = ${access.partnerId}
            AND (c.partner_user_id IN ${sql(access.visibleUserIds)} OR c.partner_user_id IS NULL)
          ORDER BY c.created_at DESC
        `;
      }
    }

    const birthDateFormatted = client.birth_date
      ? (client.birth_date instanceof Date ? client.birth_date.toISOString().slice(0, 10) : String(client.birth_date).slice(0, 10))
      : null;

    return Response.json({
      ok: true,
      client: {
        ...client,
        birth_date: birthDateFormatted,
        address,
      },
      cotacoes: cotacoes || [],
    });
  } catch (err) {
    logger.error({ err, id }, 'api.clientes.get_by_id.failed');
    return Response.json({ error: 'Erro interno ao buscar cliente' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await verifyAuth();
    if (!user) return unauthorized();

    const isAdmin = isInternalUser(user);
    const access = isAdmin ? null : await getPartnerAccessContext(user);

    if (!isAdmin && !access) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Se parceiro, valida se o cliente possui cotações acessíveis
    if (!isAdmin && access) {
      let hasAccess = false;
      if (access.visibleUserIds === null) {
        const [row] = await sql`
          SELECT 1 FROM cotacoes
          WHERE client_id = ${id} AND partner_id = ${access.partnerId}
          LIMIT 1
        `;
        hasAccess = !!row;
      } else if (access.visibleUserIds.length > 0) {
        const [row] = await sql`
          SELECT 1 FROM cotacoes
          WHERE client_id = ${id}
            AND partner_id = ${access.partnerId}
            AND (partner_user_id IN ${sql(access.visibleUserIds)} OR partner_user_id IS NULL)
          LIMIT 1
        `;
        hasAccess = !!row;
      }

      if (!hasAccess) {
        return Response.json({ error: 'Cliente não encontrado ou acesso negado' }, { status: 404 });
      }
    }

    const [existingClient] = await sql`
      SELECT * FROM insurance_clients WHERE id = ${id} LIMIT 1
    `;
    if (!existingClient) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const payload = await req.json();

    // Normalizações de documento (aceita camelCase ou snake_case)
    let documentNumber = existingClient.document_number;
    const rawDoc = payload.documentNumber ?? payload.document_number;
    if (rawDoc !== undefined) {
      const normalizedDoc = normalizeDocument(String(rawDoc));
      if (normalizedDoc) {
        if (normalizedDoc.length !== 11 && normalizedDoc.length !== 14) {
          return Response.json({ error: 'CPF deve conter 11 dígitos ou CNPJ deve conter 14 dígitos' }, { status: 400 });
        }
        if (normalizedDoc !== existingClient.document_number) {
          const [conflict] = await sql`
            SELECT id FROM insurance_clients WHERE document_number = ${normalizedDoc} AND id != ${id} LIMIT 1
          `;
          if (conflict) {
            return Response.json({ error: 'Já existe outro cliente cadastrado com este CPF/CNPJ' }, { status: 409 });
          }
        }
        documentNumber = normalizedDoc;
      }
    }
    const documentType = inferDocumentType(documentNumber);

    // Nome (aceita camelCase ou snake_case)
    const rawFullName = payload.fullName ?? payload.full_name;
    const fullName = rawFullName !== undefined
      ? String(rawFullName).trim()
      : existingClient.full_name;

    if (!fullName) {
      return Response.json({ error: 'Nome do cliente é obrigatório' }, { status: 400 });
    }

    // E-mail e Telefone
    const email = payload.email !== undefined
      ? (payload.email ? String(payload.email).trim().toLowerCase() : null)
      : existingClient.email;

    const phone = payload.phone !== undefined
      ? (payload.phone ? String(payload.phone).trim() : null)
      : existingClient.phone;

    // Data de nascimento (aceita camelCase ou snake_case)
    let birthDate: string | null = existingClient.birth_date
      ? (existingClient.birth_date instanceof Date ? existingClient.birth_date.toISOString().slice(0, 10) : String(existingClient.birth_date).slice(0, 10))
      : null;

    const rawBirthDate = payload.birthDate ?? payload.birth_date;
    if (rawBirthDate !== undefined) {
      birthDate = parseBirthDateInput(rawBirthDate);
    }

    // Endereço e Metadata
    const currentMetadata = parseJsonbField<Record<string, unknown>>(existingClient.metadata);
    const currentAddress = (currentMetadata.address && typeof currentMetadata.address === 'object' && !Array.isArray(currentMetadata.address))
      ? (currentMetadata.address as Record<string, unknown>)
      : {};

    const updatedAddress = payload.address ? {
      cep: payload.address.cep !== undefined ? String(payload.address.cep).trim() : String(currentAddress.cep || ''),
      logradouro: payload.address.logradouro !== undefined ? String(payload.address.logradouro).trim() : String(currentAddress.logradouro || ''),
      numero: payload.address.numero !== undefined ? String(payload.address.numero).trim() : String(currentAddress.numero || ''),
      complemento: payload.address.complemento !== undefined ? String(payload.address.complemento).trim() : String(currentAddress.complemento || ''),
      bairro: payload.address.bairro !== undefined ? String(payload.address.bairro).trim() : String(currentAddress.bairro || ''),
      cidade: payload.address.cidade !== undefined ? String(payload.address.cidade).trim() : String(currentAddress.cidade || ''),
      uf: payload.address.uf !== undefined ? String(payload.address.uf).trim().toUpperCase() : String(currentAddress.uf || ''),
    } : currentAddress;

    // Atualiza insurance_clients com cast explícito de birth_date e merge seguro de JSONB
    const [updatedClient] = await sql`
      UPDATE insurance_clients
      SET
        full_name = ${fullName},
        document_number = ${documentNumber},
        document_type = ${documentType},
        email = ${email},
        phone = ${phone},
        birth_date = ${birthDate ? birthDate : null}::date,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ address: updatedAddress })}::jsonb,
        updated_at = NOW()
      WHERE id = ${existingClient.id}
      RETURNING *
    `;

    if (!updatedClient) {
      return Response.json({ error: 'Cliente não encontrado para atualização' }, { status: 404 });
    }

    // Sincronização com cotações associadas (com isolamento de erro para não abortar o update do cliente)
    const syncQuotes = payload.syncQuotes !== false;
    if (syncQuotes) {
      try {
        const quotesToUpdate = isAdmin
          ? await sql<{ id: string; client_data: unknown }[]>`
              SELECT id, client_data
              FROM cotacoes
              WHERE client_id = ${existingClient.id} OR client_cpf_cnpj = ${existingClient.document_number}
            `
          : await sql<{ id: string; client_data: unknown }[]>`
              SELECT id, client_data
              FROM cotacoes
              WHERE (client_id = ${existingClient.id} OR client_cpf_cnpj = ${existingClient.document_number})
                AND partner_id = ${access!.partnerId}
            `;

        for (const q of quotesToUpdate) {
          const cd = parseJsonbField<Record<string, unknown>>(q.client_data);
          const updatedCd: Record<string, unknown> = {
            ...cd,
            nome: fullName,
            cpfCnpj: documentNumber,
            ...(email !== undefined ? { email } : {}),
            ...(phone !== undefined ? { celular: phone, telefone: phone } : {}),
            ...(birthDate !== null ? { dataNascto: birthDate } : {}),
          };

          if (payload.address) {
            updatedCd.cep = updatedAddress.cep || cd.cep;
            updatedCd.logradouro = updatedAddress.logradouro || cd.logradouro;
            updatedCd.rua = updatedAddress.logradouro || cd.rua;
            updatedCd.numero = updatedAddress.numero || cd.numero;
            updatedCd.complemento = updatedAddress.complemento || cd.complemento;
            updatedCd.bairro = updatedAddress.bairro || cd.bairro;
            updatedCd.cidade = updatedAddress.cidade || cd.cidade;
            updatedCd.uf = updatedAddress.uf || cd.uf;
          }

          await sql`
            UPDATE cotacoes
            SET
              client_id = ${existingClient.id},
              client_name = ${fullName},
              client_cpf_cnpj = ${documentNumber},
              client_email = ${email},
              client_phone = ${phone},
              client_data = ${JSON.stringify(updatedCd)}::jsonb,
              updated_at = NOW()
            WHERE id = ${q.id}
          `;
        }
      } catch (syncErr) {
        logger.warn({ syncErr, clientId: existingClient.id }, 'api.clientes.patch.quotes_sync_failed');
      }
    }

    const birthDateFormatted = updatedClient.birth_date
      ? (updatedClient.birth_date instanceof Date ? updatedClient.birth_date.toISOString().slice(0, 10) : String(updatedClient.birth_date).slice(0, 10))
      : null;

    return Response.json({
      ok: true,
      client: {
        ...updatedClient,
        birth_date: birthDateFormatted,
        address: updatedAddress,
      },
    });
  } catch (err) {
    const errorDetails = err instanceof Error ? err.message : String(err);
    logger.error({ err, id, details: errorDetails }, 'api.clientes.patch.failed');
    return Response.json({
      error: 'Erro interno ao atualizar cliente',
    }, { status: 500 });
  }
}
