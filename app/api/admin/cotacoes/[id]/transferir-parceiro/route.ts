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
    const { newPartnerId, newPartnerUserId, migrarComissoes, motivo } = body;

    if (!newPartnerId || typeof newPartnerId !== 'string') {
      return Response.json({ error: 'O ID do novo parceiro é obrigatório.' }, { status: 400 });
    }

    // 1. Localiza a cotação
    const [cotacao] = await sql<Array<{
      id: string;
      partner_id: string;
      partner_user_id: string | null;
      corretora_id: string | null;
      client_id: string | null;
      lead_id: string | null;
      client_data: unknown;
      metadata: unknown;
    }>>`
      SELECT id, partner_id, partner_user_id, corretora_id, client_id, lead_id, client_data, metadata
      FROM cotacoes
      WHERE id = ${id}
      LIMIT 1
    `;

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada.' }, { status: 404 });
    }

    if (cotacao.partner_id === newPartnerId) {
      // Se for o mesmo parceiro, verifica se apenas mudou o usuário
      if (cotacao.partner_user_id === (newPartnerUserId || null)) {
        return Response.json({ error: 'A cotação já está atribuída a este parceiro e usuário.' }, { status: 400 });
      }
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

    // 3. Valida o novo usuário do parceiro se fornecido
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

    // 4. Verifica se o parceiro original ainda está ativo no banco
    const [originalPartner] = await sql<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM partners
      WHERE id = ${cotacao.partner_id}
      LIMIT 1
    `;

    const isOriginalPartnerInactive = !originalPartner || originalPartner.status !== 'active';

    // Regra de Negócio de Comissões:
    // A comissão permanece com o vendedor original, A NÃO SER QUE:
    // - O vendedor/parceiro original não esteja mais no banco ou esteja desativado/inativo; OU
    // - O administrador/desenvolvedor tenha escolhido deliberadamente migrar também a comissão (`migrarComissoes === true`).
    const deveMigrarComissoes = Boolean(migrarComissoes) || isOriginalPartnerInactive;

    // 5. Transação Atômica de Transferência
    const auditRecord = {
      data: new Date().toISOString(),
      executadoPor: {
        id: user.userId,
        nome: user.name,
        email: user.email,
        role: user.role,
      },
      parceiroAnteriorId: cotacao.partner_id,
      usuarioAnteriorId: cotacao.partner_user_id,
      novoParceiroId: newPartner.id,
      novoParceiroNome: newPartner.nome_fantasia || newPartner.razao_social,
      novoUsuarioId: targetPartnerUserId,
      motivo: motivo ? String(motivo).trim() : null,
      comissoesMigradas: deveMigrarComissoes,
      motivoMigracaoComissao: isOriginalPartnerInactive
        ? 'Parceiro original inativo/desativado no sistema'
        : migrarComissoes
        ? 'Solicitado deliberadamente pelo administrador/desenvolvedor'
        : 'Comissões mantidas com o parceiro original',
    };

    const currentMeta = parseJsonbField<Record<string, unknown>>(cotacao.metadata);
    const historicoTransferencias = Array.isArray(currentMeta.historicoTransferencias)
      ? [...currentMeta.historicoTransferencias, auditRecord]
      : [auditRecord];

    const currentClientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);
    const updatedClientData = {
      ...currentClientData,
      partnerId: newPartner.id,
      partnerName: newPartner.nome_fantasia || newPartner.razao_social,
    };

    await sql.begin(async (tx) => {
      // 5.1 Atualiza a Cotação
      await tx`
        UPDATE cotacoes
        SET
          partner_id = ${newPartner.id},
          partner_user_id = ${targetPartnerUserId},
          corretora_id = ${newPartner.corretora_id},
          client_data = ${JSON.stringify(updatedClientData)}::jsonb,
          metadata = ${JSON.stringify({ ...currentMeta, historicoTransferencias })}::jsonb,
          updated_at = NOW()
        WHERE id = ${id}
      `;

      // 5.2 Atualiza Venda (se houver)
      await tx`
        UPDATE sales
        SET
          partner_id = ${newPartner.id},
          corretora_id = ${newPartner.corretora_id},
          updated_at = NOW()
        WHERE cotacao_id = ${id}
      `;

      // 5.3 Atualiza Comissões (conforme a regra de negócio deliberada)
      if (deveMigrarComissoes) {
        await tx`
          UPDATE commissions
          SET
            partner_id = ${newPartner.id},
            corretora_id = ${newPartner.corretora_id}
          WHERE sale_id IN (SELECT id FROM sales WHERE cotacao_id = ${id})
        `;
      }

      // 5.4 Atualiza Lead associado (se houver)
      if (cotacao.lead_id) {
        await tx`
          UPDATE leads
          SET
            partner_id = ${newPartner.id},
            corretora_id = ${newPartner.corretora_id},
            data_atualizacao = NOW()
          WHERE id = ${cotacao.lead_id}
        `;
      }

      // 5.5 Atualiza o parceiro de referência no cliente
      if (cotacao.client_id) {
        await tx`
          UPDATE insurance_clients
          SET
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ partnerId: newPartner.id })}::jsonb,
            updated_at = NOW()
          WHERE id = ${cotacao.client_id}
        `;
      }
    });

    logger.info({
      cotacaoId: id,
      parceiroAnterior: cotacao.partner_id,
      novoParceiro: newPartner.id,
      deveMigrarComissoes,
      admin: user.email,
    }, 'api.admin.cotacoes.transferir_parceiro.success');

    return Response.json({
      ok: true,
      message: 'Parceiro da cotação transferido com sucesso.',
      details: {
        novoParceiro: newPartner.nome_fantasia || newPartner.razao_social,
        comissoesMigradas: deveMigrarComissoes,
      },
    });
  } catch (err) {
    logger.error({ err, cotacaoId: id }, 'api.admin.cotacoes.transferir_parceiro.failed');
    return Response.json({ error: 'Erro ao transferir parceiro da cotação.' }, { status: 500 });
  }
}
