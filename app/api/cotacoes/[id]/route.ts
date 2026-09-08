import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { upsertInsuranceClient } from '@/lib/insurance-ops';
import { parseJsonbField } from '@/lib/json-safe';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const publicToken = req.headers.get('x-public-token');
  const { id } = await params;

  try {
    if (publicToken) {
      const [link] = await sql`
        SELECT partner_id FROM public_sale_links
        WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `;
      if (!link) return Response.json({ error: 'Token público inválido' }, { status: 401 });

      const [cotacao] = await sql`
        SELECT * FROM cotacoes
        WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${link.partner_id}
        LIMIT 1
      `;
      if (!cotacao) return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
      return Response.json({ ok: true, cotacao });
    }

    const user = await verifyAuth();
    if (!user) return unauthorized();

    const accessible = await getAccessibleQuoteById(id, user);
    if (!accessible) {
      return Response.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const [cotacao] = await sql`
      SELECT
        c.*,
        p.name AS product_name,
        p.flow_key AS product_flow_key,
        part.nome_fantasia AS partner_name,
        part.razao_social AS partner_razao_social
      FROM cotacoes c
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN partners part ON part.id = c.partner_id
      WHERE c.id = ${id}
      LIMIT 1
    `;

    return Response.json({ ok: true, cotacao: cotacao || accessible });
  } catch (err) {
    logger.error({ err, id }, 'api.cotacoes.get_by_id.failed');
    return Response.json({ error: 'Erro interno ao buscar cotação' }, { status: 500 });
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

    const cotacao = await getAccessibleQuoteById(id, user);
    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const payload = await req.json();

    const currentClientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);

    // Normalização dos dados cadastrais do cliente (aceita camelCase ou snake_case)
    const rawClientName = payload.clientName ?? payload.client_name;
    const clientName = rawClientName !== undefined
      ? String(rawClientName).trim()
      : cotacao.client_name;

    let clientCpfCnpj = cotacao.client_cpf_cnpj;
    const rawCpfCnpj = payload.clientCpfCnpj ?? payload.client_cpf_cnpj;
    if (rawCpfCnpj !== undefined) {
      const normalizedDoc = String(rawCpfCnpj).replace(/\D/g, '');
      if (normalizedDoc) {
        if (normalizedDoc.length !== 11 && normalizedDoc.length !== 14) {
          return Response.json({ error: 'CPF deve conter 11 dígitos ou CNPJ deve conter 14 dígitos' }, { status: 400 });
        }
        clientCpfCnpj = normalizedDoc;
      }
    }

    const rawEmail = payload.clientEmail ?? payload.client_email;
    const clientEmail = rawEmail !== undefined
      ? (rawEmail ? String(rawEmail).trim().toLowerCase() : null)
      : cotacao.client_email;

    const rawPhone = payload.clientPhone ?? payload.client_phone;
    const clientPhone = rawPhone !== undefined
      ? (rawPhone ? String(rawPhone).trim() : null)
      : cotacao.client_phone;

    // Data de nascimento
    let birthDate: string | null = null;
    const rawBirthDate = payload.birthDate ?? payload.birth_date;
    if (rawBirthDate !== undefined) {
      if (rawBirthDate) {
        const bd = String(rawBirthDate).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(bd)) {
          const [d, m, y] = bd.split('/');
          birthDate = `${y}-${m}-${d}`;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(bd)) {
          birthDate = bd.slice(0, 10);
        }
      }
    } else if (currentClientData.dataNascto) {
      birthDate = String(currentClientData.dataNascto).slice(0, 10);
    }

    // Endereço
    const currentAddress = {
      cep: String(currentClientData.cep || ''),
      logradouro: String(currentClientData.logradouro || currentClientData.rua || ''),
      numero: String(currentClientData.numero || ''),
      complemento: String(currentClientData.complemento || ''),
      bairro: String(currentClientData.bairro || ''),
      cidade: String(currentClientData.cidade || ''),
      uf: String(currentClientData.uf || ''),
    };

    const updatedAddress = payload.address ? {
      cep: payload.address.cep !== undefined ? String(payload.address.cep).trim() : currentAddress.cep,
      logradouro: payload.address.logradouro !== undefined ? String(payload.address.logradouro).trim() : currentAddress.logradouro,
      numero: payload.address.numero !== undefined ? String(payload.address.numero).trim() : currentAddress.numero,
      complemento: payload.address.complemento !== undefined ? String(payload.address.complemento).trim() : currentAddress.complemento,
      bairro: payload.address.bairro !== undefined ? String(payload.address.bairro).trim() : currentAddress.bairro,
      cidade: payload.address.cidade !== undefined ? String(payload.address.cidade).trim() : currentAddress.cidade,
      uf: payload.address.uf !== undefined ? String(payload.address.uf).trim().toUpperCase() : currentAddress.uf,
    } : currentAddress;

    // Regra da Opção 1:
    // Status rascunho ou enviada: permite atualizar todos os campos.
    // Status assinado, pagamento_gerado, aprovada, emitida (e outros status pós-emissão/contrato):
    // Preserva os valores financeiros originais da cotação (importanciaSegurada, premioFinal e plano)
    // para integridade com ZapSign e Asaas, tanto para corretores quanto administradores.
    const isFinancialMutable = ['rascunho', 'enviada'].includes(cotacao.status);

    const proposal = (payload.proposalData || {}) as Record<string, unknown>;

    const rawImportancia = proposal.importanciaSegurada ?? payload.importancia_segurada ?? payload.importanciaSegurada;
    const importanciaSegurada = isFinancialMutable && rawImportancia !== undefined
      ? Number(rawImportancia)
      : (cotacao.importancia_segurada !== null ? Number(cotacao.importancia_segurada) : null);

    const rawPremio = proposal.premioFinal ?? payload.premio_final ?? payload.premioFinal;
    const premioFinal = isFinancialMutable && rawPremio !== undefined
      ? Number(rawPremio)
      : (cotacao.premio_final !== null ? Number(cotacao.premio_final) : null);

    const rawPlanoNome = proposal.planoNome ?? payload.plano_nome ?? payload.nomePlano;
    const planoNome = isFinancialMutable && rawPlanoNome !== undefined
      ? String(rawPlanoNome)
      : (currentClientData.nomePlano || currentClientData.tipoDePlano || currentClientData.tipo || 'RC Advogados');

    const rawFranquia = proposal.franquia ?? payload.planoFranquia ?? payload.franquia;
    const franquia = rawFranquia !== undefined
      ? String(rawFranquia)
      : (currentClientData.planoFranquia || currentClientData.franquia || 'R$ 1.000,00');

    const rawParcela = proposal.parcela ?? payload.parcela;
    const parcela = rawParcela !== undefined
      ? rawParcela
      : (currentClientData.parcela || 1);

    const rawNotes = proposal.notes ?? payload.notes;
    const notes = rawNotes !== undefined
      ? (rawNotes ? String(rawNotes) : null)
      : cotacao.notes;

    // Mesclagem de client_data preservando dados anteriores (tokens ZapSign, checkoutId, etc.)
    const mergedClientData: Record<string, unknown> = {
      ...currentClientData,
      nome: clientName,
      cpfCnpj: clientCpfCnpj,
      email: clientEmail,
      celular: clientPhone,
      telefone: clientPhone,
      ...(birthDate ? { dataNascto: birthDate } : {}),
      // Endereço
      cep: updatedAddress.cep,
      logradouro: updatedAddress.logradouro,
      rua: updatedAddress.logradouro,
      numero: updatedAddress.numero,
      complemento: updatedAddress.complemento,
      bairro: updatedAddress.bairro,
      cidade: updatedAddress.cidade,
      uf: updatedAddress.uf,
      // Plano e coberturas
      nomePlano: planoNome,
      tipoDePlano: planoNome,
      tipo: planoNome,
      planoFranquia: franquia,
      franquia: franquia,
      parcela,
      ...(premioFinal !== null ? { valor: premioFinal, premioFinal } : {}),
      ...(importanciaSegurada !== null ? { valorCobertura: `R$ ${importanciaSegurada.toLocaleString('pt-BR')}` } : {}),
      // Dados profissionais da proposta (sempre permitidos)
      ...(proposal.oab !== undefined ? { oab: proposal.oab } : {}),
      ...(proposal.oabUf !== undefined ? { oabUf: proposal.oabUf } : {}),
      ...(proposal.atuacao !== undefined ? { atuacao: proposal.atuacao } : {}),
      ...(proposal.titularidade !== undefined ? { titularidade: proposal.titularidade } : {}),
      ...(proposal.escritorioAssociado !== undefined ? { escritorioAssociado: proposal.escritorioAssociado } : {}),
      ...(proposal.faturamentoAntes !== undefined ? { faturamentoAntes: proposal.faturamentoAntes } : {}),
      ...(proposal.faturamentoDepois !== undefined ? { faturamentoDepois: proposal.faturamentoDepois } : {}),
      ...(proposal.dataInicioVigencia !== undefined ? {
        dataInicioVigencia: proposal.dataInicioVigencia,
        vigencia: proposal.dataInicioVigencia,
        dataVigencia: proposal.dataInicioVigencia,
      } : {}),
    };

    // Sincroniza o cliente em insurance_clients
    const insuranceClient = await upsertInsuranceClient({
      documentNumber: clientCpfCnpj,
      fullName: clientName,
      email: clientEmail,
      phone: clientPhone,
      birthDate,
      metadata: {
        address: updatedAddress,
        partnerId: cotacao.partner_id,
      },
    });

    // Atualiza a cotação
    await sql`
      UPDATE cotacoes
      SET
        client_id = ${insuranceClient.id},
        client_name = ${clientName},
        client_cpf_cnpj = ${clientCpfCnpj},
        client_email = ${clientEmail},
        client_phone = ${clientPhone},
        client_data = ${JSON.stringify(mergedClientData)}::jsonb,
        importancia_segurada = ${importanciaSegurada},
        premio_final = ${premioFinal},
        notes = ${notes},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    // Retorna a cotação atualizada completa com joins
    const [updatedQuote] = await sql`
      SELECT
        c.*,
        p.name AS product_name,
        p.flow_key AS product_flow_key,
        part.nome_fantasia AS partner_name,
        part.razao_social AS partner_razao_social
      FROM cotacoes c
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN partners part ON part.id = c.partner_id
      WHERE c.id = ${id}
      LIMIT 1
    `;

    return Response.json({ ok: true, cotacao: updatedQuote });
  } catch (err) {
    logger.error({ err, id }, 'api.cotacoes.patch.failed');
    return Response.json({ error: 'Erro interno ao atualizar cotação' }, { status: 500 });
  }
}
