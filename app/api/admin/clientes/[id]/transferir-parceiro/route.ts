import { NextRequest } from 'next/server';
import { verifyAuth, isInternalUser, unauthorized } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { parseJsonbField } from '@/lib/json-safe';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await verifyAuth();
    if (!user || !isInternalUser(user)) {
      return unauthorized();
    }

    const body = await req.json();
    const { newPartnerId, newPartnerUserId, transferAllQuotes = true, migrarComissoes, motivo } = body;

    if (!newPartnerId || typeof newPartnerId !== 'string') {
      return Response.json({ error: 'O ID do novo parceiro é obrigatório.' }, { status: 400 });
    }

    // 1. Localiza o cliente
    const [client] = await sql<Array<{
      id: string;
      full_name: string;
      document_number: string;
      metadata: unknown;
    }>>`
      SELECT id, full_name, document_number, metadata
      FROM insurance_clients
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!client) {
      return Response.json({ error: 'Cliente não encontrado.' }, { status: 404 });
    }

    // 2. Valida o novo parceiro
    const [newPartner] = await sql<Array<{
      id: string;
      nome_fantasia: string | null;
      razao_social: string;
      status: string;
      corretora_id: string | null;
    }>>`
      SELECT id, nome_fantasia, razao_social, status, corretora_id
      FROM partners
      WHERE id = ${newPartnerId}
      LIMIT 1
    `;

    if (!newPartner) {
      return Response.json({ error: 'Novo parceiro não encontrado.' }, { status: 404 });
    }

    // 3. Valida o usuário do novo parceiro se fornecido
    let targetPartnerUserId: string | null = null;
    if (newPartnerUserId) {
      const [partnerUser] = await sql<Array<{ id: string; name: string }>>`
        SELECT id, name
        FROM partner_users
        WHERE id = ${newPartnerUserId} AND partner_id = ${newPartnerId} AND is_active = true
        LIMIT 1
      `;
      if (partnerUser) {
        targetPartnerUserId = partnerUser.id;
      }
    }

    // 4. Busca todas as cotações associadas ao cliente
    const quotes = await sql<Array<{
      id: string;
      partner_id: string;
      partner_user_id: string | null;
      corretora_id: string | null;
      lead_id: string | null;
      client_data: unknown;
      metadata: unknown;
    }>>`
      SELECT id, partner_id, partner_user_id, corretora_id, lead_id, client_data, metadata
      FROM cotacoes
      WHERE client_id = ${id}
         OR (client_cpf_cnpj = ${client.document_number} AND ${client.document_number} != '')
    `;

    // 5. Para cada parceiro original das cotações, verifica seu status ativo/inativo
    const partnerIds = Array.from(new Set(quotes.map((q) => q.partner_id)));
    const partnerStatuses = new Map<string, string>();
    if (partnerIds.length > 0) {
      const partnersList = await sql<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM partners
        WHERE id IN ${sql(partnerIds)}
      `;
      for (const p of partnersList) {
        partnerStatuses.set(p.id, p.status);
      }
    }

    const auditRecord = {
      data: new Date().toISOString(),
      executadoPor: {
        id: user.userId,
        nome: user.name,
        email: user.email,
        role: user.role,
      },
      clienteId: client.id,
      clienteNome: client.full_name,
      novoParceiroId: newPartner.id,
      novoParceiroNome: newPartner.nome_fantasia || newPartner.razao_social,
      novoUsuarioId: targetPartnerUserId,
      motivo: motivo ? String(motivo).trim() : null,
      migrarComissoesDeliberado: Boolean(migrarComissoes),
      cotacoesAfetadas: quotes.length,
    };

    const currentMeta = parseJsonbField<Record<string, unknown>>(client.metadata);
    const historicoTransferencias = Array.isArray(currentMeta.historicoTransferencias)
      ? [...currentMeta.historicoTransferencias, auditRecord]
      : [auditRecord];

    await sql.begin(async (tx) => {
      // 6.1 Atualiza metadata do cliente
      await tx`
        UPDATE insurance_clients
        SET
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            ...currentMeta,
            partnerId: newPartner.id,
            partnerName: newPartner.nome_fantasia || newPartner.razao_social,
            historicoTransferencias,
          })}::jsonb,
          updated_at = NOW()
        WHERE id = ${id}
      `;

      // 6.2 Se transferAllQuotes estiver ativo, transfere cotações, vendas, comissões e leads
      if (transferAllQuotes && quotes.length > 0) {
        for (const quote of quotes) {
          const originalStatus = partnerStatuses.get(quote.partner_id);
          const isOriginalPartnerInactive = !originalStatus || originalStatus !== 'active';

          // Regra de Comissões:
          // Só migra comissões se o parceiro original estiver inativo/desativado OU se o admin/dev marcou explicitamente
          const deveMigrarComissao = Boolean(migrarComissoes) || isOriginalPartnerInactive;

          const qClientData = parseJsonbField<Record<string, unknown>>(quote.client_data);
          const updatedQClientData = {
            ...qClientData,
            partnerId: newPartner.id,
            partnerName: newPartner.nome_fantasia || newPartner.razao_social,
          };

          const qMeta = parseJsonbField<Record<string, unknown>>(quote.metadata);
          const qHistorico = Array.isArray(qMeta.historicoTransferencias)
            ? [...qMeta.historicoTransferencias, auditRecord]
            : [auditRecord];

          // Atualiza cotação
          await tx`
            UPDATE cotacoes
            SET
              partner_id = ${newPartner.id},
              partner_user_id = ${targetPartnerUserId},
              corretora_id = ${newPartner.corretora_id},
              client_id = ${client.id},
              client_data = ${JSON.stringify(updatedQClientData)}::jsonb,
              metadata = ${JSON.stringify({ ...qMeta, historicoTransferencias: qHistorico })}::jsonb,
              updated_at = NOW()
            WHERE id = ${quote.id}
          `;

          // Atualiza vendas da cotação
          await tx`
            UPDATE sales
            SET
              partner_id = ${newPartner.id},
              corretora_id = ${newPartner.corretora_id},
              client_id = ${client.id},
              updated_at = NOW()
            WHERE cotacao_id = ${quote.id}
          `;

          // Atualiza comissões se aplicável
          if (deveMigrarComissao) {
            await tx`
              UPDATE commissions
              SET
                partner_id = ${newPartner.id},
                corretora_id = ${newPartner.corretora_id}
              WHERE sale_id IN (SELECT id FROM sales WHERE cotacao_id = ${quote.id})
            `;
          }

          // Atualiza lead associado
          if (quote.lead_id) {
            await tx`
              UPDATE leads
              SET
                partner_id = ${newPartner.id},
                corretora_id = ${newPartner.corretora_id},
                data_atualizacao = NOW()
              WHERE id = ${quote.lead_id}
            `;
          }
        }

        // Também atualiza leads gerais do mesmo CPF/CNPJ
        if (client.document_number) {
          await tx`
            UPDATE leads
            SET
              partner_id = ${newPartner.id},
              corretora_id = ${newPartner.corretora_id},
              data_atualizacao = NOW()
            WHERE document_number = ${client.document_number}
          `;
        }
      }
    });

    logger.info({
      clientId: id,
      novoParceiro: newPartner.id,
      quotesCount: quotes.length,
      admin: user.email,
    }, 'api.admin.clientes.transferir_parceiro.success');

    return Response.json({
      ok: true,
      message: `Cliente transferido com sucesso para ${newPartner.nome_fantasia || newPartner.razao_social}.`,
      details: {
        novoParceiro: newPartner.nome_fantasia || newPartner.razao_social,
        cotacoesTransferidas: transferAllQuotes ? quotes.length : 0,
      },
    });
  } catch (err) {
    logger.error({ err, clientId: id }, 'api.admin.clientes.transferir_parceiro.failed');
    return Response.json({ error: 'Erro ao transferir parceiro do cliente.' }, { status: 500 });
  }
}
