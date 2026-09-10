import { NextRequest } from 'next/server';
import { verifyAuth, isInternalUser, unauthorized, getPartnerAccessContext } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { parseJsonbField } from '@/lib/json-safe';
import { parseAtuacaoList } from '@/lib/atuacao';

function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

function formatDateToIso(dateVal: unknown): string {
  if (!dateVal) return '';
  try {
    const s = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {
    // fallback
  }
  return '';
}

function formatCpfCnpj(v: string) {
  const digits = (v || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return v;
}

function formatCurrency(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
  if (isNaN(num)) return typeof val === 'string' ? val : '';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth();
    if (!user) return unauthorized();

    const isAdmin = isInternalUser(user);
    const access = isAdmin ? null : await getPartnerAccessContext(user);

    if (!isAdmin && !access) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const partnerIdParam = searchParams.get('partnerId') || null;

    if (!q || q.length < 2) {
      return Response.json({ clients: [] });
    }

    const textLike = `%${escapeLike(q)}%`;
    const digitsOnly = q.replace(/\D/g, '');
    const digitsLike = digitsOnly.length >= 3 ? `%${escapeLike(digitsOnly)}%` : null;

    // Constrói a busca base de clientes
    let clients: any[] = [];

    if (isAdmin) {
      // Admin pode pesquisar todos os clientes
      if (digitsLike) {
        clients = await sql`
          SELECT id, document_number, document_type, full_name, email, phone, birth_date, metadata, created_at
          FROM insurance_clients
          WHERE (
            full_name ILIKE ${textLike}
            OR email ILIKE ${textLike}
            OR document_number ILIKE ${digitsLike}
            OR phone ILIKE ${digitsLike}
          )
          ORDER BY
            CASE WHEN document_number = ${digitsOnly} THEN 0
                 WHEN full_name ILIKE ${q + '%'} THEN 1
                 ELSE 2 END,
            created_at DESC
          LIMIT 8
        `;
      } else {
        clients = await sql`
          SELECT id, document_number, document_type, full_name, email, phone, birth_date, metadata, created_at
          FROM insurance_clients
          WHERE (
            full_name ILIKE ${textLike}
            OR email ILIKE ${textLike}
          )
          ORDER BY
            CASE WHEN full_name ILIKE ${q + '%'} THEN 0 ELSE 1 END,
            created_at DESC
          LIMIT 8
        `;
      }
    } else if (access) {
      // Parceiro pesquisa clientes da sua carteira ou por documento exato
      const isExactDoc = digitsOnly.length >= 11;
      const targetPartnerId = access.partnerId;

      if (isExactDoc) {
        // Se digitou CPF/CNPJ completo, permite encontrar o cliente mesmo que criado globalmente
        clients = await sql`
          SELECT id, document_number, document_type, full_name, email, phone, birth_date, metadata, created_at
          FROM insurance_clients
          WHERE document_number = ${digitsOnly}
          LIMIT 1
        `;
      }

      // Se não encontrou por doc exato, busca na carteira do parceiro
      if (clients.length === 0) {
        if (digitsLike) {
          clients = await sql`
            SELECT DISTINCT ic.id, ic.document_number, ic.document_type, ic.full_name, ic.email, ic.phone, ic.birth_date, ic.metadata, ic.created_at
            FROM insurance_clients ic
            LEFT JOIN cotacoes c ON c.client_id = ic.id AND c.partner_id = ${targetPartnerId}
            LEFT JOIN sales s ON s.client_id = ic.id AND s.partner_id = ${targetPartnerId}
            WHERE (
              c.id IS NOT NULL OR s.id IS NOT NULL OR (ic.metadata->>'partnerId') = ${targetPartnerId}
            )
            AND (
              ic.full_name ILIKE ${textLike}
              OR ic.email ILIKE ${textLike}
              OR ic.document_number ILIKE ${digitsLike}
              OR ic.phone ILIKE ${digitsLike}
            )
            ORDER BY ic.created_at DESC
            LIMIT 8
          `;
        } else {
          clients = await sql`
            SELECT DISTINCT ic.id, ic.document_number, ic.document_type, ic.full_name, ic.email, ic.phone, ic.birth_date, ic.metadata, ic.created_at
            FROM insurance_clients ic
            LEFT JOIN cotacoes c ON c.client_id = ic.id AND c.partner_id = ${targetPartnerId}
            LEFT JOIN sales s ON s.client_id = ic.id AND s.partner_id = ${targetPartnerId}
            WHERE (
              c.id IS NOT NULL OR s.id IS NOT NULL OR (ic.metadata->>'partnerId') = ${targetPartnerId}
            )
            AND (
              ic.full_name ILIKE ${textLike}
              OR ic.email ILIKE ${textLike}
            )
            ORDER BY ic.created_at DESC
            LIMIT 8
          `;
        }
      }
    }

    if (clients.length === 0) {
      return Response.json({ clients: [] });
    }

    // Enriquece cada cliente com dados consolidados de endereço e dados de renovação
    const enrichedClients = await Promise.all(
      clients.map(async (client) => {
        const metadata = parseJsonbField<Record<string, unknown>>(client.metadata);
        const metaAddress = (metadata.address && typeof metadata.address === 'object' && !Array.isArray(metadata.address))
          ? (metadata.address as Record<string, unknown>)
          : null;

        // Busca última apólice em sales
        const [latestSale] = await sql`
          SELECT s.*, p.name AS product_name
          FROM sales s
          JOIN products p ON p.id = s.product_id
          WHERE s.client_id = ${client.id}
          ORDER BY s.created_at DESC
          LIMIT 1
        `;

        // Busca última cotação (com prioridade para aprovada/emitida ou a mais recente)
        const [latestQuote] = await sql`
          SELECT c.*, p.name AS product_name
          FROM cotacoes c
          JOIN products p ON p.id = c.product_id
          WHERE c.client_id = ${client.id}
          ORDER BY
            CASE WHEN c.status IN ('aprovada', 'emitida', 'assinado', 'pagamento_gerado') THEN 0 ELSE 1 END,
            c.created_at DESC
          LIMIT 1
        `;

        const latestClientData = latestQuote ? parseJsonbField<Record<string, unknown>>(latestQuote.client_data) : {};

        // Endereço consolidado
        const address = {
          cep: String(metaAddress?.cep || latestClientData.cep || ''),
          logradouro: String(metaAddress?.logradouro || latestClientData.logradouro || latestClientData.rua || ''),
          numero: String(metaAddress?.numero || latestClientData.numero || ''),
          complemento: String(metaAddress?.complemento || latestClientData.complemento || ''),
          bairro: String(metaAddress?.bairro || latestClientData.bairro || ''),
          cidade: String(metaAddress?.cidade || latestClientData.cidade || ''),
          uf: String(metaAddress?.uf || latestClientData.uf || '').toUpperCase(),
        };

        // Dados profissionais
        const oab = String(metadata.oab || latestClientData.oab || '');
        const dataAtividade = formatDateToIso(metadata.dataAtividade || latestClientData.dataAtividade);
        const birthDate = formatDateToIso(client.birth_date || latestClientData.dataNascto);

        // Dados para renovação
        const hasPreviousPolicy = !!latestSale || ['aprovada', 'emitida', 'assinado', 'pagamento_gerado'].includes(latestQuote?.status);
        const policyNumber = latestSale?.policy_number || (latestQuote ? `DL-RC-${latestQuote.id.slice(0, 8).toUpperCase()}` : '');

        // Determina vigência anterior e sugestão da nova
        const expiryDate = latestSale?.expiry_date ? formatDateToIso(latestSale.expiry_date) : formatDateToIso(latestClientData.vigencia || latestQuote?.valid_until);
        const issueDate = latestSale?.issue_date ? formatDateToIso(latestSale.issue_date) : formatDateToIso(latestClientData.dataInicioVigencia || latestQuote?.created_at);

        // Se tiver expiryDate, nova vigência inicia no dia seguinte
        let suggestedNewVigencia = '';
        if (expiryDate) {
          try {
            const exp = new Date(expiryDate + 'T00:00:00');
            exp.setDate(exp.getDate() + 1);
            suggestedNewVigencia = exp.toISOString().split('T')[0];
          } catch {
            suggestedNewVigencia = '';
          }
        }

        const coverageValue = latestSale?.importancia_segurada || latestQuote?.importancia_segurada || latestClientData.valorCobertura;
        const premiumValue = latestSale?.premio_total || latestQuote?.premio_final || latestClientData.valor;
        const franquiaValue = latestClientData.franquia || latestClientData.planoFranquia || 'R$ 1.000,00';

        // Áreas de atuação anteriores
        const atuacao = parseAtuacaoList(latestClientData.atuacao);

        // PPE
        const ppeCargos = latestClientData.ppeCargos === 'Sim' || latestClientData.ppeCargos === true ? 'Sim' : 'Não';
        const ppeRepresenta = latestClientData.ppeRepresenta === 'Sim' || latestClientData.ppeRepresenta === true ? 'Sim' : 'Não';
        let ppeCargoSelect: string[] = [];
        if (Array.isArray(latestClientData.ppeCargoSelect)) {
          ppeCargoSelect = latestClientData.ppeCargoSelect;
        } else if (typeof latestClientData.ppeCargoSelect === 'string' && latestClientData.ppeCargoSelect && latestClientData.ppeCargoSelect !== '0') {
          ppeCargoSelect = latestClientData.ppeCargoSelect.split(',').filter(Boolean);
        }

        const renewalData = {
          hasPreviousPolicy,
          policyNumber,
          seguradora: String(latestClientData.seguradora || 'Kovr Seguradora'),
          vigenciaAnterior: expiryDate,
          limite: formatCurrency(coverageValue),
          franquia: typeof franquiaValue === 'string' ? franquiaValue : formatCurrency(franquiaValue),
          premio: formatCurrency(premiumValue),
          dataRetroativa: formatDateToIso(latestClientData.dataRetroativa || issueDate),
          dataInicioVigenciaSugerida: suggestedNewVigencia || issueDate,
          faturamentoAntes: latestClientData.faturamentoAntes ? String(latestClientData.faturamentoAntes) : '',
          faturamentoDepois: latestClientData.faturamentoDepois ? String(latestClientData.faturamentoDepois) : '',
          atuacao,
          ppeCargos,
          ppeRepresenta,
          ppeCargoSelect,
          previousQuoteId: latestQuote?.id || null,
          previousSaleId: latestSale?.id || null,
        };

        return {
          id: client.id,
          fullName: client.full_name,
          documentNumber: client.document_number,
          documentFormatted: formatCpfCnpj(client.document_number),
          email: client.email || '',
          phone: client.phone || '',
          birthDate,
          oab,
          dataAtividade,
          address,
          renewalData,
        };
      })
    );

    return Response.json({ clients: enrichedClients });
  } catch (err) {
    console.error('Erro na rota /api/clientes/busca:', err);
    return Response.json({ error: 'Erro interno ao buscar clientes' }, { status: 500 });
  }
}
