import { sql } from './pg';
import { logger } from './logger';
import { getAsaasConfig } from './system-settings';
import { calcularVencimentosRestantes, ParcelaProjetada } from './vencimento-sequencial';

export interface CanceladoIndevidoItem {
  cotacaoId: string;
  clienteNome: string;
  clienteCpfCnpj: string;
  clienteEmail: string | null;
  clientePhone: string | null;
  policyNumber: string | null;
  saleId: string | null;
  saleStatus: string | null;
  cotacaoStatus: string;
  valorTotalContratado: number;
  totalParcelasContratadas: number;
  totalPago: number;
  parcelasPagasCount: number;
  saldoFaltante: number;
  qtdParcelasRestantes: number;
  parcelasPagas: Array<{
    id: string;
    numero: number;
    amount: number;
    dueDate: string;
    paidAt: string | null;
    status: string;
  }>;
  parcelasCanceladas: Array<{
    id: string;
    numero: number;
    amount: number;
    dueDate: string;
    status: string;
    externalPaymentId: string | null;
    notes?: string | null;
  }>;
  datasProjetadasRestantes: ParcelaProjetada[];
  statusReativacao: 'pendente' | 'reativado';
  ultimoCancelamentoMotivo?: string | null;
  ultimoCancelamentoData?: string | null;
}

export const LISTA_NOMES_AFETADOS_OFICIAL = [
  'Antonio Clovis Garcia',
  'RAPHAEL DANILLE CORREIA',
  'TÚLIO ALECSANDER VICENTE SANTOS',
  'Rafael de Jesus da Silva',
  'Jackson Alex Vinotti',
  'Nelton Romano Marques',
  'Agamenon Carneiro de Aguiar Junior',
  'Guilherme de Oliveira',
  'Sandriele Adriani Weiss',
  'MARIANA MARTINS DA ROSA',
  'CAROLINE NIEDERAUER RODRIGUES',
  'PAULO HENRIQUE SOUSA',
  'Vinícius Busnardo de Souza',
  'Mateus Marques Stahn',
  'Carlos Roberto Magna',
  'LUCAS ADRIANO PEREIRA DE SOUZA',
  'Jeronice Martins dos Santos',
  'Ana Paula Costa Vianna',
  'MARIANA PEREIRA NEVES ANDRIANI',
  'ÉDER MUCHA',
  'Aldo Batista dos Santos Junior',
  'GEIZE QUERINO DE SOUZA E SILVA BASEGIO',
  'Alini Masson Dallacosta',
  'LEANDRO NASCIMENTO MARIA',
  'Adriana Chagas',
  'Breno Angioletti Licio',
  'PAULO GILBERTO ZANDAVALLI WINCKLER',
  'Chirle de Lima Borges Kotovicz',
  'Patrícia Noronha Borges',
  'LIDIANE ALESSA TRIBESS',
  'SÉRGIO DOMINGOS DE ALMEID',
  'DÉBORA CANDIDA SPAGNOL',
  'JOÃO OLMIRO DA ROSA',
  'Lizeth Sandra Ferreira Detros',
  'JEFERSON RODRIGO DE OLIVEIRA',
  'MONIA KITIANE TONIAL',
];

/**
 * Consulta e agrega todos os contratos que sofreram cancelamento indevido.
 */
export async function listarCanceladosIndevidos(): Promise<CanceladoIndevidoItem[]> {
  try {
    // 1. Busca cotações que possuem parcelas canceladas OU status cancelada
    // Priorizando os nomes informados e qualquer contrato com parcelas canceladas
    const cotacoesRows = await sql<any[]>`
      SELECT DISTINCT
        c.id AS cotacao_id,
        c.client_name,
        c.client_cpf_cnpj,
        c.client_email,
        c.client_phone,
        c.status AS cotacao_status,
        c.premio_final,
        c.premio_calculado,
        c.client_data,
        c.metadata AS cotacao_metadata,
        c.updated_at AS cotacao_updated_at,
        s.id AS sale_id,
        s.policy_number,
        s.status AS sale_status,
        s.premio_total AS sale_premio_total,
        s.metadata AS sale_metadata,
        po.installment_count AS order_installment_count,
        po.amount_total AS order_amount_total
      FROM cotacoes c
      LEFT JOIN sales s ON s.cotacao_id = c.id
      LEFT JOIN payment_orders po ON po.cotacao_id = c.id
      WHERE (
        c.status = 'cancelada'
        OR s.status = 'cancelada'
        OR EXISTS (
          SELECT 1 FROM payment_installments pi
          WHERE pi.cotacao_id = c.id AND pi.status = 'cancelled'
        )
      )
      ORDER BY c.client_name ASC
    `;

    if (!cotacoesRows || cotacoesRows.length === 0) {
      return [];
    }

    const cotacaoIds = cotacoesRows.map((r) => r.cotacao_id);

    // 2. Busca todas as parcelas dessas cotações
    const installmentsRows = await sql<any[]>`
      SELECT
        id,
        cotacao_id,
        installment_number,
        amount,
        due_date::text AS due_date,
        paid_at::text AS paid_at,
        status,
        external_payment_id,
        invoice_url,
        bank_slip_url,
        notes,
        updated_at
      FROM payment_installments
      WHERE cotacao_id IN ${sql(cotacaoIds)}
      ORDER BY cotacao_id ASC, installment_number ASC, due_date ASC
    `;

    const installmentsByCotacao = new Map<string, any[]>();
    for (const inst of installmentsRows) {
      const list = installmentsByCotacao.get(inst.cotacao_id) || [];
      list.push(inst);
      installmentsByCotacao.set(inst.cotacao_id, list);
    }

    const items: CanceladoIndevidoItem[] = [];

    for (const row of cotacoesRows) {
      const allInsts = installmentsByCotacao.get(row.cotacao_id) || [];

      const parcelasPagas = allInsts
        .filter((i) => ['paid', 'received', 'confirmed', 'received_in_cash'].includes(String(i.status || '').toLowerCase()))
        .map((i) => ({
          id: i.id,
          numero: Number(i.installment_number) || 1,
          amount: Number(i.amount) || 0,
          dueDate: String(i.due_date || ''),
          paidAt: i.paid_at ? String(i.paid_at) : null,
          status: i.status,
        }));

      const parcelasCanceladas = allInsts
        .filter((i) => String(i.status || '').toLowerCase() === 'cancelled')
        .map((i) => ({
          id: i.id,
          numero: Number(i.installment_number) || 1,
          amount: Number(i.amount) || 0,
          dueDate: String(i.due_date || ''),
          status: i.status,
          externalPaymentId: i.external_payment_id || null,
          notes: i.notes || null,
        }));

      const clientData = typeof row.client_data === 'string' ? JSON.parse(row.client_data || '{}') : (row.client_data || {});
      const totalContratado = Number(
        row.sale_premio_total ?? row.premio_final ?? row.premio_calculado ?? clientData.valor ?? 0
      );

      const totalParcelas = Number(
        row.order_installment_count ?? clientData.parcela ?? allInsts.length ?? 1
      );

      const totalPago = parcelasPagas.reduce((acc, p) => acc + p.amount, 0);
      const saldoFaltante = Math.max(0, Math.round((totalContratado - totalPago) * 100) / 100);

      // Quantidade de parcelas faltantes
      const qtdParcelasRestantes = Math.max(
        0,
        parcelasCanceladas.length > 0
          ? parcelasCanceladas.length
          : totalParcelas - parcelasPagas.length
      );

      // Cálculo de vencimentos sequenciais baseado no histórico de parcelas pagas
      const datasProjetadas = calcularVencimentosRestantes({
        totalParcelas,
        qtdParcelasRestantes: qtdParcelasRestantes > 0 ? qtdParcelasRestantes : 1,
        parcelasPagas: parcelasPagas.map((p) => ({
          numero: p.numero,
          due_date: p.dueDate,
          paid_at: p.paidAt,
          status: p.status,
          amount: p.amount,
        })),
        dataBaseFallback: allInsts[0]?.due_date || row.cotacao_updated_at,
      });

      const isReativado = Boolean(
        row.sale_status === 'ativa' &&
        row.cotacao_status === 'aprovada' &&
        (row.cotacao_metadata?.reativado_manualmente === true || row.sale_metadata?.reativado_manualmente === true)
      );

      const cancelNotes = parcelasCanceladas.find((p: any) => p.notes)?.notes || 'Inadimplência';

      items.push({
        cotacaoId: row.cotacao_id,
        clienteNome: row.client_name || 'Segurado',
        clienteCpfCnpj: row.client_cpf_cnpj || '',
        clienteEmail: row.client_email,
        clientePhone: row.client_phone,
        policyNumber: row.policy_number,
        saleId: row.sale_id,
        saleStatus: row.sale_status,
        cotacaoStatus: row.cotacao_status,
        valorTotalContratado: totalContratado,
        totalParcelasContratadas: totalParcelas,
        totalPago,
        parcelasPagasCount: parcelasPagas.length,
        saldoFaltante,
        qtdParcelasRestantes,
        parcelasPagas,
        parcelasCanceladas,
        datasProjetadasRestantes: datasProjetadas,
        statusReativacao: isReativado ? 'reativado' : 'pendente',
        ultimoCancelamentoMotivo: cancelNotes,
        ultimoCancelamentoData: row.cotacao_updated_at,
      });
    }

    return items;
  } catch (err: any) {
    logger.error({ err }, 'cancelamentos-indevidos: falha ao listar registros');
    return [];
  }
}

export interface ReativarCobrancaParams {
  cotacaoId: string;
  dueDateOverride?: string;
}

export interface ReativarCobrancaResult {
  ok: boolean;
  message?: string;
  error?: string;
  cotacaoId: string;
  policyNumber?: string;
  saldoReativado?: number;
  qtdParcelas?: number;
  checkoutId?: string;
  linkBoleto?: string;
  parcelasGeradas?: ParcelaProjetada[];
}

/**
 * Reativa atomicamente a cotação/apólice e emite no Asaas apenas a cobrança do saldo faltante.
 */
export async function reativarCobrancaFaltante(
  params: ReativarCobrancaParams
): Promise<ReativarCobrancaResult> {
  const { cotacaoId } = params;
  if (!cotacaoId || !cotacaoId.trim()) {
    return { ok: false, error: 'ID da cotação não informado', cotacaoId: '' };
  }

  const cleanId = cotacaoId.trim();

  try {
    // 1. Busca cotação, venda e parcelas atuais
    const [cotacao] = await sql<any[]>`
      SELECT
        c.*,
        s.id AS sale_id,
        s.policy_number,
        s.status AS sale_status,
        s.premio_total,
        po.id AS payment_order_id,
        po.installment_count AS order_installment_count
      FROM cotacoes c
      LEFT JOIN sales s ON s.cotacao_id = c.id
      LEFT JOIN payment_orders po ON po.cotacao_id = c.id
      WHERE c.id = ${cleanId}
      LIMIT 1
    `;

    if (!cotacao) {
      return { ok: false, error: 'Cotação não encontrada no sistema', cotacaoId: cleanId };
    }

    const allInsts = await sql<any[]>`
      SELECT *
      FROM payment_installments
      WHERE cotacao_id = ${cleanId}
      ORDER BY installment_number ASC, due_date ASC
    `;

    const parcelasPagas = allInsts.filter((i) =>
      ['paid', 'received', 'confirmed', 'received_in_cash'].includes(String(i.status || '').toLowerCase())
    );

    const clientData = typeof cotacao.client_data === 'string'
      ? JSON.parse(cotacao.client_data || '{}')
      : (cotacao.client_data || {});

    const totalContratado = Number(
      cotacao.premio_total ?? cotacao.premio_final ?? cotacao.premio_calculado ?? clientData.valor ?? 0
    );

    const totalParcelas = Number(
      cotacao.order_installment_count ?? clientData.parcela ?? allInsts.length ?? 1
    );

    const totalPago = parcelasPagas.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const saldoFaltante = Math.max(0, Math.round((totalContratado - totalPago) * 100) / 100);

    const canceladas = allInsts.filter((i) => String(i.status || '').toLowerCase() === 'cancelled');
    const qtdParcelasRestantes = Math.max(
      1,
      canceladas.length > 0 ? canceladas.length : totalParcelas - parcelasPagas.length
    );

    // Se o cliente já quitou tudo, apenas reativa sem emitir nova cobrança
    if (saldoFaltante <= 0) {
      await sql`
        UPDATE sales
        SET status = 'ativa',
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reativado_manualmente}', 'true'),
            updated_at = NOW()
        WHERE cotacao_id = ${cleanId};

        UPDATE cotacoes
        SET status = 'aprovada',
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reativado_manualmente}', 'true'),
            updated_at = NOW()
        WHERE id = ${cleanId};
      `;

      return {
        ok: true,
        message: 'Contrato totalmente quitado reativado com sucesso (sem novas cobranças necessárias).',
        cotacaoId: cleanId,
        policyNumber: cotacao.policy_number,
        saldoReativado: 0,
        qtdParcelas: 0,
      };
    }

    // Calcula vencimentos sequenciais respeitando as datas pagas
    const datasProjetadas = calcularVencimentosRestantes({
      totalParcelas,
      qtdParcelasRestantes,
      parcelasPagas: parcelasPagas.map((p) => ({
        numero: Number(p.installment_number) || 1,
        due_date: p.due_date,
        paid_at: p.paid_at,
        status: p.status,
        amount: Number(p.amount) || 0,
      })),
      dataBaseFallback: params.dueDateOverride || allInsts[0]?.due_date,
    });

    const primeiraDataVencimento = params.dueDateOverride || datasProjetadas[0]?.dueDate;

    // 2. Integração com Gateway Asaas
    const { apiKey, baseUrl } = await getAsaasConfig();
    let checkoutId = '';
    let linkBoleto = '';
    let netValue = 0;
    let externalInstallmentId: string | null = null;

    if (apiKey) {
      // Resolve ou cria o cliente no Asaas
      const cleanDoc = (cotacao.client_cpf_cnpj || '').replace(/\D/g, '');
      let clienteId = clientData.clienteId || '';

      if (cleanDoc && !clienteId) {
        try {
          const findRes = await fetch(`${baseUrl}/customers?cpfCnpj=${cleanDoc}`, {
            headers: { access_token: apiKey },
          });
          if (findRes.ok) {
            const findJson = await findRes.json();
            if (findJson.data && findJson.data.length > 0) {
              clienteId = findJson.data[0].id;
            }
          }
        } catch (findErr) {
          logger.warn({ findErr, cleanId }, 'reativarCobranca: aviso ao buscar cliente no Asaas');
        }
      }

      if (!clienteId) {
        const createCustRes = await fetch(`${baseUrl}/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: apiKey,
          },
          body: JSON.stringify({
            name: cotacao.client_name,
            cpfCnpj: cleanDoc,
            email: cotacao.client_email || 'suporte@duolife.net.br',
            mobilePhone: (cotacao.client_phone || '').replace(/\D/g, ''),
            notificationDisabled: true,
          }),
        });

        if (createCustRes.ok) {
          const custJson = await createCustRes.json();
          clienteId = custJson.id;
        }
      }

      if (clienteId) {
        const valorParcela = Math.round((saldoFaltante / qtdParcelasRestantes) * 100) / 100;
        const descricao = `Seguro RC Profissional - Faturas Restantes (#${cleanId.slice(0, 8).toUpperCase()})`;

        let paymentPayload: Record<string, any> = {
          customer: clienteId,
          billingType: 'UNDEFINED',
          dueDate: primeiraDataVencimento,
          description: descricao,
          externalReference: cleanId,
        };

        if (qtdParcelasRestantes > 1) {
          paymentPayload = {
            ...paymentPayload,
            value: valorParcela,
            installmentCount: qtdParcelasRestantes,
            installmentValue: valorParcela,
          };
        } else {
          paymentPayload = {
            ...paymentPayload,
            value: saldoFaltante,
          };
        }

        const payRes = await fetch(`${baseUrl}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            access_token: apiKey,
          },
          body: JSON.stringify(paymentPayload),
        });

        if (payRes.ok) {
          const payJson = await payRes.json();
          checkoutId = payJson.id;
          linkBoleto = payJson.invoiceUrl || payJson.bankSlipUrl || '';
          netValue = Number(payJson.netValue) || 0;
          externalInstallmentId = payJson.installment || null;
        } else {
          const errBody = await payRes.text();
          logger.error({ errBody, cleanId }, 'reativarCobranca: falha ao emitir faturas no Asaas');
        }
      }
    }

    // 3. Atualização Atômica no PostgreSQL
    return await sql.begin(async (tx) => {
      // a) Reativa a Apólice (sales)
      await tx`
        UPDATE sales
        SET status = 'ativa',
            metadata = jsonb_set(
              jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reativado_manualmente}', 'true'),
              '{isento_cancelamento}', 'true'
            ),
            updated_at = NOW()
        WHERE cotacao_id = ${cleanId}
      `;

      // b) Reativa a Cotação (cotacoes)
      await tx`
        UPDATE cotacoes
        SET status = 'aprovada',
            metadata = jsonb_set(
              jsonb_set(COALESCE(metadata, '{}'::jsonb), '{reativado_manualmente}', 'true'),
              '{isento_cancelamento}', 'true'
            ),
            updated_at = NOW()
        WHERE id = ${cleanId}
      `;

      // c) Reativa Comissões vinculadas se estiverem estornadas
      await tx`
        UPDATE commissions
        SET status = 'pendente',
            notes = COALESCE(notes || ' | ', '') || 'Comissão reativada com retomada das faturas',
            updated_at = NOW()
        WHERE sale_id IN (SELECT id FROM sales WHERE cotacao_id = ${cleanId})
          AND status = 'estornada'
      `;

      // d) Atualiza payment_orders
      if (cotacao.payment_order_id) {
        await tx`
          UPDATE payment_orders
          SET status = 'pending',
              amount_total = ${saldoFaltante},
              installment_count = ${qtdParcelasRestantes},
              external_payment_id = COALESCE(${checkoutId || null}, external_payment_id),
              external_installment_id = COALESCE(${externalInstallmentId || null}, external_installment_id),
              invoice_url = COALESCE(${linkBoleto || null}, invoice_url),
              bank_slip_url = COALESCE(${linkBoleto || null}, bank_slip_url),
              due_date = ${primeiraDataVencimento}::date,
              updated_at = NOW()
          WHERE id = ${cotacao.payment_order_id}
        `;
      }

      // e) Cria as novas parcelas ativas para o saldo faltante
      const valorPorParcela = Math.round((saldoFaltante / qtdParcelasRestantes) * 100) / 100;
      const orderId = cotacao.payment_order_id;

      for (let idx = 0; idx < datasProjetadas.length; idx++) {
        const proj = datasProjetadas[idx];
        const isFirst = idx === 0;

        await tx`
          INSERT INTO payment_installments (
            payment_order_id,
            cotacao_id,
            installment_number,
            amount,
            net_amount,
            due_date,
            status,
            external_payment_id,
            external_installment_id,
            invoice_url,
            bank_slip_url,
            notes,
            created_at,
            updated_at
          ) VALUES (
            ${orderId},
            ${cleanId},
            ${proj.numero},
            ${valorPorParcela},
            ${isFirst ? (netValue || valorPorParcela) : valorPorParcela},
            ${proj.dueDate}::date,
            'pending',
            ${isFirst && checkoutId ? checkoutId : null},
            ${externalInstallmentId || null},
            ${isFirst && linkBoleto ? linkBoleto : null},
            ${isFirst && linkBoleto ? linkBoleto : null},
            'Parcela residual reativada com vencimento sequencial',
            NOW(),
            NOW()
          )
        `;
      }

      logger.info(
        { cleanId, saldoFaltante, qtdParcelasRestantes, primeiraDataVencimento },
        'reativarCobranca: contrato reativado e faturas residuais geradas com sucesso'
      );

      return {
        ok: true,
        message: `Cobrança reativada com sucesso! ${qtdParcelasRestantes} parcela(s) gerada(s) totalizando R$ ${saldoFaltante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        cotacaoId: cleanId,
        policyNumber: cotacao.policy_number,
        saldoReativado: saldoFaltante,
        qtdParcelas: qtdParcelasRestantes,
        checkoutId,
        linkBoleto,
        parcelasGeradas: datasProjetadas,
      };
    });
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    logger.error({ err, cleanId }, 'reativarCobranca: falha ao reativar cobranca');
    return { ok: false, error: errorMsg, cotacaoId: cleanId };
  }
}
