import { sql } from './pg';
import { logger } from './logger';
import { getSystemSetting } from './system-settings';
import { sendTemplatedEmail } from './email-service';
import { dispatchDomainEvent } from './triggers/dispatcher';
import { parseCurrencyToNumber } from './format';
import { isInstallmentPastCancellationDeadline } from './business-days';
import { cancelSaleAndQuoteForDelinquency } from './insurance-ops';

export interface LifecycleConfig {
  renewalWindows: number[];
  renewalEnabled: boolean;
  delinquencyEnabled: boolean;
  delinquencyDueSoonDays: number[];
  delinquencyOverdueDays: number[];
  cronSecret: string;
  appBaseUrl: string;
}

export interface ScanResult {
  scanned: number;
  notified: number;
  skipped: number;
  errors: string[];
}

export interface CancellationScanResult {
  scanned: number;
  canceled: number;
  skipped: number;
  errors: string[];
}

export interface FullLifecycleResult {
  ok: boolean;
  timestamp: string;
  targetDate: string;
  dryRun: boolean;
  durationMs: number;
  renewals: ScanResult;
  delinquency: ScanResult;
  cancellations?: CancellationScanResult;
  errors: string[];
}

function parseDaysList(val: string | undefined, defaultDays: number[]): number[] {
  if (!val || !val.trim()) return defaultDays;
  const days = val
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return days.length > 0 ? days : defaultDays;
}

function formatCpfCnpj(v: string | null | undefined): string {
  const digits = (v || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return v || '';
}

function formatCurrency(val: unknown): string {
  if (val === null || val === undefined || val === '') return '0,00';
  const num = typeof val === 'number' ? val : parseCurrencyToNumber(val, NaN);
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateBr(dateVal: unknown): string {
  if (!dateVal) return '';
  try {
    const s = String(dateVal).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
  } catch {}
  return String(dateVal);
}

function parseIsoDate(val: string | Date): Date {
  if (val instanceof Date) return val;
  const s = String(val).slice(0, 10);
  const [year, month, day] = s.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export async function getLifecycleConfig(): Promise<LifecycleConfig> {
  const [
    renewalWindowsRaw,
    renewalEnabledRaw,
    delinquencyEnabledRaw,
    dueSoonDaysRaw,
    overdueDaysRaw,
    cronSecretRaw,
  ] = await Promise.all([
    getSystemSetting('RENEWAL_WINDOWS', '60,30,15,0'),
    getSystemSetting('RENEWAL_ENABLED', 'true'),
    getSystemSetting('INADIMPLENCIA_ENABLED', 'true'),
    getSystemSetting('INADIMPLENCIA_A_VENCER_DAYS', '3,1'),
    getSystemSetting('INADIMPLENCIA_VENCIDAS_DAYS', '1,3,7,15'),
    getSystemSetting('CRON_SECRET', process.env.CRON_SECRET || ''),
  ]);

  const appBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://duolife.com.br'
  ).replace(/\/$/, '');

  return {
    renewalWindows: parseDaysList(renewalWindowsRaw, [60, 30, 15, 0]),
    renewalEnabled: renewalEnabledRaw.toLowerCase() !== 'false',
    delinquencyEnabled: delinquencyEnabledRaw.toLowerCase() !== 'false',
    delinquencyDueSoonDays: parseDaysList(dueSoonDaysRaw, [3, 1]),
    delinquencyOverdueDays: parseDaysList(overdueDaysRaw, [1, 3, 7, 15]),
    cronSecret: cronSecretRaw || '',
    appBaseUrl,
  };
}

/**
 * 1. Módulo de Varredura de Renovação de Apólices (D-60, D-30, D-15, D-0)
 */
export async function runRenewalScan(options?: {
  targetDate?: string;
  dryRun?: boolean;
}): Promise<ScanResult> {
  const config = await getLifecycleConfig();
  const dryRun = Boolean(options?.dryRun);
  const targetDateStr = options?.targetDate || new Date().toISOString().slice(0, 10);
  const targetDateObj = parseIsoDate(targetDateStr);

  const result: ScanResult = {
    scanned: 0,
    notified: 0,
    skipped: 0,
    errors: [],
  };

  if (!config.renewalEnabled) {
    logger.info('Régua de renovação desativada nas configurações.');
    return result;
  }

  try {
    const policies = await sql<
      {
        sale_id: string;
        cotacao_id: string;
        client_id: string | null;
        partner_id: string;
        product_id: string;
        policy_number: string | null;
        importancia_segurada: number | null;
        premio_total: number | null;
        expiry_date: string;
        client_name: string;
        client_cpf_cnpj: string;
        client_email: string | null;
        client_phone: string | null;
        partner_user_id: string | null;
        partner_name: string;
        partner_email: string;
        partner_user_name: string | null;
        partner_user_email: string | null;
        product_name: string;
      }[]
    >`
      SELECT
        s.id AS sale_id,
        s.cotacao_id,
        s.client_id,
        s.partner_id,
        s.product_id,
        s.policy_number,
        s.importancia_segurada,
        s.premio_total,
        s.expiry_date::text AS expiry_date,
        c.client_name,
        c.client_cpf_cnpj,
        c.client_email,
        c.client_phone,
        c.partner_user_id,
        p.razao_social AS partner_name,
        p.email AS partner_email,
        pu.name AS partner_user_name,
        pu.email AS partner_user_email,
        pr.name AS product_name
      FROM sales s
      JOIN cotacoes c ON c.id = s.cotacao_id
      JOIN products pr ON pr.id = s.product_id
      JOIN partners p ON p.id = s.partner_id
      LEFT JOIN partner_users pu ON pu.id = c.partner_user_id
      WHERE s.status = 'ativa'
        AND s.expiry_date IS NOT NULL
      ORDER BY s.expiry_date ASC
    `;

    result.scanned = policies.length;

    for (const policy of policies) {
      try {
        const expiryDateObj = parseIsoDate(policy.expiry_date);
        const diffTime = expiryDateObj.getTime() - targetDateObj.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        // Verifica se a diferença de dias bate com alguma janela configurada (ex.: 60, 30, 15, 0)
        let matchedWindow: number | null = null;
        for (const w of config.renewalWindows) {
          if (w === 0 && diffDays <= 0 && diffDays >= -1) {
            matchedWindow = 0;
            break;
          } else if (diffDays === w) {
            matchedWindow = w;
            break;
          }
        }

        if (matchedWindow === null) {
          result.skipped++;
          continue;
        }

        // 1. Verificação de Idempotência: já notificou para esta apólice, janela e vigência?
        const [existingNotif] = await sql<{ id: string }[]>`
          SELECT id FROM policy_renewal_notifications
          WHERE sale_id = ${policy.sale_id}
            AND window_days = ${matchedWindow}
            AND target_date = ${policy.expiry_date}::date
          LIMIT 1
        `;

        if (existingNotif) {
          result.skipped++;
          continue;
        }

        // 2. Verificação de Renovação Prévia: a apólice já foi renovada pelo corretor?
        const [alreadyRenewed] = await sql<{ id: string }[]>`
          SELECT id FROM cotacoes
          WHERE (renewed_from_cotacao_id = ${policy.cotacao_id} OR client_data->>'renewedFromSaleId' = ${policy.sale_id})
            AND status IN ('aprovada', 'emitida', 'assinado', 'pagamento_gerado')
          LIMIT 1
        `;

        if (alreadyRenewed) {
          result.skipped++;
          continue;
        }

        // 3. Resolução do Corretor Responsável
        const recipientEmail = (
          policy.partner_user_email ||
          policy.partner_email ||
          ''
        ).trim().toLowerCase();

        if (!recipientEmail || !recipientEmail.includes('@')) {
          result.errors.push(`Apólice ${policy.policy_number}: parceiro sem e-mail válido.`);
          result.skipped++;
          continue;
        }

        const brokerName = (
          policy.partner_user_name ||
          policy.partner_name ||
          'Corretor'
        ).trim();

        // 4. Link Direto com 1-Click Renewal no Portal
        const docDigits = policy.client_cpf_cnpj.replace(/\D/g, '');
        const renewalLink = `${config.appBaseUrl}/portal/cotacoes/nova?product=${encodeURIComponent(
          policy.product_id
        )}&cpf=${encodeURIComponent(docDigits)}&renovacao=true&origemSaleId=${encodeURIComponent(
          policy.sale_id
        )}`;

        const windowLabel = matchedWindow === 0 ? 'D-0 (Expira Hoje)' : `D-${matchedWindow}`;

        const templateVariables: Record<string, any> = {
          nome: brokerName,
          cliente_nome: policy.client_name,
          cliente_documento: formatCpfCnpj(policy.client_cpf_cnpj),
          cliente_telefone: policy.client_phone || 'Não informado',
          cliente_email: policy.client_email || 'Não informado',
          apolice_numero: policy.policy_number || `DL-RC-${policy.cotacao_id.slice(0, 8).toUpperCase()}`,
          produto_nome: policy.product_name || 'Seguro RC Profissional',
          cobertura: formatCurrency(policy.importancia_segurada),
          premio_atual: formatCurrency(policy.premio_total),
          data_expiracao: formatDateBr(policy.expiry_date),
          dias_restantes: Math.max(0, diffDays),
          janela_label: windowLabel,
          link_renovacao: renewalLink,
        };

        let emailLogId: string | undefined = undefined;

        if (!dryRun) {
          // Disparo oficial do e-mail
          const dispatchRes = await sendTemplatedEmail({
            templateCode: 'alerta_renovacao_corretor',
            to: recipientEmail,
            toName: brokerName,
            variables: templateVariables,
            metadata: {
              saleId: policy.sale_id,
              cotacaoId: policy.cotacao_id,
              partnerId: policy.partner_id,
              windowDays: matchedWindow,
              type: 'renewal_cadence',
            },
          });

          if (!dispatchRes.success) {
            result.errors.push(
              `Erro no envio de renovação da apólice ${policy.policy_number}: ${dispatchRes.error}`
            );
          } else {
            emailLogId = dispatchRes.logId;
          }

          // Dispara evento de domínio para possíveis gatilhos adicionais
          await dispatchDomainEvent('APOLICE_A_EXPIRAR', {
            eventType: 'APOLICE_A_EXPIRAR',
            contextId: policy.cotacao_id,
            cliente: {
              nome: policy.client_name,
              email: policy.client_email || undefined,
              documento: policy.client_cpf_cnpj,
              telefone: policy.client_phone || undefined,
            },
            parceiro: {
              id: policy.partner_id,
              nome: brokerName,
              email: recipientEmail,
            },
            cotacao: {
              id: policy.cotacao_id,
              cobertura: Number(policy.importancia_segurada) || undefined,
              premio_final: Number(policy.premio_total) || undefined,
              produto_nome: policy.product_name,
            },
            dados: templateVariables,
          });

          // Grava idempotência no banco de dados
          await sql`
            INSERT INTO policy_renewal_notifications (
              sale_id, cotacao_id, client_id, partner_id, partner_user_id,
              window_days, target_date, recipient_email, status, email_log_id, metadata
            ) VALUES (
              ${policy.sale_id},
              ${policy.cotacao_id},
              ${policy.client_id},
              ${policy.partner_id},
              ${policy.partner_user_id},
              ${matchedWindow},
              ${policy.expiry_date}::date,
              ${recipientEmail},
              ${dispatchRes.success ? 'sent' : 'failed'},
              ${emailLogId || null},
              ${sql.json({
                diffDays,
                windowLabel,
                policyNumber: policy.policy_number,
                dispatchError: dispatchRes.error || null,
              })}
            )
            ON CONFLICT (sale_id, window_days, target_date) DO NOTHING
          `;
        }

        result.notified++;
        logger.info(
          { saleId: policy.sale_id, window: windowLabel, recipient: recipientEmail, dryRun },
          'Notificação de renovação processada'
        );
      } catch (itemErr: any) {
        const msg = itemErr?.message || String(itemErr);
        result.errors.push(`Erro ao processar apólice ${policy.sale_id}: ${msg}`);
      }
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.error({ err }, 'Falha geral na varredura de renovação');
    result.errors.push(`Falha no banco de dados / varredura: ${msg}`);
  }

  return result;
}

/**
 * 2. Módulo de Alertas de Inadimplência Asaas (A Vencer e Vencidas)
 */
export async function runDelinquencyScan(options?: {
  targetDate?: string;
  dryRun?: boolean;
}): Promise<ScanResult> {
  const config = await getLifecycleConfig();
  const dryRun = Boolean(options?.dryRun);
  const targetDateStr = options?.targetDate || new Date().toISOString().slice(0, 10);
  const targetDateObj = parseIsoDate(targetDateStr);

  const result: ScanResult = {
    scanned: 0,
    notified: 0,
    skipped: 0,
    errors: [],
  };

  if (!config.delinquencyEnabled) {
    logger.info('Régua de inadimplência desativada nas configurações.');
    return result;
  }

  try {
    const installments = await sql<
      {
        installment_id: string;
        payment_order_id: string;
        cotacao_id: string;
        client_id: string | null;
        installment_number: number;
        amount: number | null;
        due_date: string;
        installment_status: string;
        invoice_url: string | null;
        bank_slip_url: string | null;
        pix_qr_code_url: string | null;
        partner_id: string;
        installment_count: number;
        client_name: string;
        client_cpf_cnpj: string;
        client_email: string | null;
        client_phone: string | null;
        partner_user_id: string | null;
        partner_name: string;
        partner_email: string;
        partner_user_name: string | null;
        partner_user_email: string | null;
        policy_number: string | null;
      }[]
    >`
      SELECT
        pi.id AS installment_id,
        pi.payment_order_id,
        pi.cotacao_id,
        pi.client_id,
        pi.installment_number,
        pi.amount,
        pi.due_date::text AS due_date,
        pi.status AS installment_status,
        pi.invoice_url,
        pi.bank_slip_url,
        pi.pix_qr_code_url,
        po.partner_id,
        po.installment_count,
        c.client_name,
        c.client_cpf_cnpj,
        c.client_email,
        c.client_phone,
        c.partner_user_id,
        p.razao_social AS partner_name,
        p.email AS partner_email,
        pu.name AS partner_user_name,
        pu.email AS partner_user_email,
        s.policy_number
      FROM payment_installments pi
      JOIN payment_orders po ON po.id = pi.payment_order_id
      JOIN cotacoes c ON c.id = pi.cotacao_id
      JOIN partners p ON p.id = po.partner_id
      LEFT JOIN partner_users pu ON pu.id = c.partner_user_id
      LEFT JOIN sales s ON s.cotacao_id = c.id
      WHERE pi.status IN ('pending', 'overdue')
        AND pi.due_date IS NOT NULL
      ORDER BY pi.due_date ASC
    `;

    result.scanned = installments.length;

    for (const inst of installments) {
      try {
        const dueDateObj = parseIsoDate(inst.due_date);
        const diffTime = dueDateObj.getTime() - targetDateObj.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        let notificationType: 'a_vencer' | 'vencida' | null = null;
        let triggerDay: number | null = null;

        if (diffDays > 0) {
          // Faturas a vencer: dias até o vencimento (ex: 3, 1)
          if (config.delinquencyDueSoonDays.includes(diffDays)) {
            notificationType = 'a_vencer';
            triggerDay = -diffDays; // armazenado como negativo para diferenciar
          }
        } else {
          // Faturas vencidas: dias de atraso (ex: 1, 3, 7, 15)
          const daysOverdue = Math.abs(diffDays);
          if (config.delinquencyOverdueDays.includes(daysOverdue)) {
            notificationType = 'vencida';
            triggerDay = daysOverdue;
          }
        }

        if (!notificationType || triggerDay === null) {
          result.skipped++;
          continue;
        }

        // 1. Verificação de Idempotência
        const [existingNotif] = await sql<{ id: string }[]>`
          SELECT id FROM delinquency_notifications
          WHERE installment_id = ${inst.installment_id}
            AND notification_type = ${notificationType}
            AND trigger_day = ${triggerDay}
          LIMIT 1
        `;

        if (existingNotif) {
          result.skipped++;
          continue;
        }

        // 2. Resolução do Corretor Responsável
        const brokerEmail = (
          inst.partner_user_email ||
          inst.partner_email ||
          ''
        ).trim().toLowerCase();

        if (!brokerEmail || !brokerEmail.includes('@')) {
          result.errors.push(`Parcela ${inst.installment_id}: corretor sem e-mail válido.`);
          result.skipped++;
          continue;
        }

        const brokerName = (
          inst.partner_user_name ||
          inst.partner_name ||
          'Corretor'
        ).trim();

        // 3. Link da Fatura Asaas
        const faturaUrl =
          inst.invoice_url ||
          inst.bank_slip_url ||
          `${config.appBaseUrl}/portal/cotacoes/${inst.cotacao_id}`;

        const parcelaInfo = `${inst.installment_number} de ${inst.installment_count || 1}`;

        const templateCode =
          notificationType === 'a_vencer'
            ? 'alerta_fatura_a_vencer_corretor'
            : 'alerta_inadimplencia_corretor';

        const templateVariables: Record<string, any> = {
          nome: brokerName,
          cliente_nome: inst.client_name,
          cliente_documento: formatCpfCnpj(inst.client_cpf_cnpj),
          cliente_telefone: inst.client_phone || 'Não informado',
          cliente_email: inst.client_email || 'Não informado',
          apolice_numero: inst.policy_number || '',
          cotacao_id: inst.cotacao_id.slice(0, 8).toUpperCase(),
          parcela_info: parcelaInfo,
          valor_parcela: formatCurrency(inst.amount),
          data_vencimento: formatDateBr(inst.due_date),
          dias_vencimento: Math.max(0, diffDays),
          dias_atraso: Math.max(0, Math.abs(diffDays)),
          link_fatura: faturaUrl,
        };

        let emailLogId: string | undefined = undefined;

        if (!dryRun) {
          // Dispara e-mail para o corretor responsável
          const dispatchRes = await sendTemplatedEmail({
            templateCode,
            to: brokerEmail,
            toName: brokerName,
            variables: templateVariables,
            metadata: {
              installmentId: inst.installment_id,
              paymentOrderId: inst.payment_order_id,
              cotacaoId: inst.cotacao_id,
              partnerId: inst.partner_id,
              notificationType,
              triggerDay,
            },
          });

          if (!dispatchRes.success) {
            result.errors.push(
              `Erro no alerta de inadimplência da parcela ${inst.installment_id}: ${dispatchRes.error}`
            );
          } else {
            emailLogId = dispatchRes.logId;
          }

          // Dispara evento de domínio
          const domainEvent = notificationType === 'a_vencer' ? 'FATURA_A_VENCER' : 'FATURA_VENCIDA_ALERTA';
          await dispatchDomainEvent(domainEvent, {
            eventType: domainEvent,
            contextId: inst.cotacao_id,
            cliente: {
              nome: inst.client_name,
              email: inst.client_email || undefined,
              documento: inst.client_cpf_cnpj,
              telefone: inst.client_phone || undefined,
            },
            parceiro: {
              id: inst.partner_id,
              nome: brokerName,
              email: brokerEmail,
            },
            transacao: {
              id: inst.installment_id,
              valor: Number(inst.amount) || undefined,
              vencimento: formatDateBr(inst.due_date),
              link_fatura: faturaUrl,
              status: inst.installment_status,
            },
            dados: templateVariables,
          });

          // Registra notificação no banco
          await sql`
            INSERT INTO delinquency_notifications (
              installment_id, payment_order_id, cotacao_id, client_id, partner_id,
              notification_type, trigger_day, due_date, recipient_email, recipient_type,
              status, email_log_id, metadata
            ) VALUES (
              ${inst.installment_id},
              ${inst.payment_order_id},
              ${inst.cotacao_id},
              ${inst.client_id},
              ${inst.partner_id},
              ${notificationType},
              ${triggerDay},
              ${inst.due_date}::date,
              ${brokerEmail},
              'broker',
              ${dispatchRes.success ? 'sent' : 'failed'},
              ${emailLogId || null},
              ${sql.json({
                diffDays,
                parcelaInfo,
                policyNumber: inst.policy_number,
                dispatchError: dispatchRes.error || null,
              })}
            )
            ON CONFLICT (installment_id, notification_type, trigger_day) DO NOTHING
          `;
        }

        result.notified++;
        logger.info(
          {
            installmentId: inst.installment_id,
            type: notificationType,
            triggerDay,
            recipient: brokerEmail,
            dryRun,
          },
          'Alerta de inadimplência processado'
        );
      } catch (itemErr: any) {
        const msg = itemErr?.message || String(itemErr);
        result.errors.push(`Erro ao processar parcela ${inst.installment_id}: ${msg}`);
      }
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.error({ err }, 'Falha geral na varredura de inadimplência');
    result.errors.push(`Falha no banco de dados / varredura de parcelas: ${msg}`);
  }

  return result;
}

/**
 * 3. Módulo de Cancelamento Automático por Inadimplência
 * - Parcela 1: Cancelamento se atraso > 2 dias úteis
 * - Parcelas 2+: Cancelamento se atraso > 30 dias corridos (prorrogados até o próximo dia útil se recair em dia não útil)
 */
export async function runDelinquencyCancellationScan(options?: {
  targetDate?: string;
  dryRun?: boolean;
}): Promise<CancellationScanResult> {
  const dryRun = Boolean(options?.dryRun);
  const targetDateStr = options?.targetDate || new Date().toISOString().slice(0, 10);

  const result: CancellationScanResult = {
    scanned: 0,
    canceled: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const overdueInstallments = await sql<
      {
        installment_id: string;
        cotacao_id: string;
        installment_number: number;
        due_date: string;
        amount: number | null;
        external_payment_id: string | null;
        policy_number: string | null;
      }[]
    >`
      SELECT
        pi.id AS installment_id,
        pi.cotacao_id,
        pi.installment_number,
        pi.due_date::text AS due_date,
        pi.amount,
        pi.external_payment_id,
        s.policy_number
      FROM payment_installments pi
      JOIN cotacoes c ON c.id = pi.cotacao_id
      LEFT JOIN sales s ON s.cotacao_id = c.id
      WHERE pi.status NOT IN ('paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'cancelled')
        AND c.status NOT IN ('cancelada', 'recusada')
        AND (s.id IS NULL OR s.status = 'ativa')
        AND pi.due_date < ${targetDateStr}::date
      ORDER BY pi.installment_number ASC, pi.due_date ASC
    `;

    result.scanned = overdueInstallments.length;

    const processedQuotes = new Set<string>();

    for (const inst of overdueInstallments) {
      if (processedQuotes.has(inst.cotacao_id)) {
        result.skipped++;
        continue;
      }

      const isPastDeadline = isInstallmentPastCancellationDeadline(
        inst.due_date,
        inst.installment_number,
        targetDateStr
      );

      if (!isPastDeadline) {
        result.skipped++;
        continue;
      }

      processedQuotes.add(inst.cotacao_id);

      const reason =
        inst.installment_number === 1
          ? `Inadimplência da 1ª parcela (atraso superior a 2 dias úteis da data de vencimento ${inst.due_date})`
          : `Inadimplência da parcela ${inst.installment_number} (atraso superior a 30 dias corridos da data de vencimento ${inst.due_date})`;

      if (dryRun) {
        logger.info(
          { cotacaoId: inst.cotacao_id, reason, dryRun: true },
          'lifecycle: simulação de cancelamento por inadimplência'
        );
        result.canceled++;
      } else {
        const cancelRes = await cancelSaleAndQuoteForDelinquency({
          cotacaoId: inst.cotacao_id,
          installmentId: inst.installment_id,
          installmentNumber: inst.installment_number,
          dueDate: inst.due_date,
          reason,
        });

        if (cancelRes.success) {
          result.canceled++;
        } else {
          result.errors.push(
            `Erro ao cancelar cotação ${inst.cotacao_id}: ${cancelRes.error || 'Erro desconhecido'}`
          );
        }
      }
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.error({ err }, 'Falha na varredura de cancelamentos por inadimplência');
    result.errors.push(`Falha no banco / varredura de cancelamentos: ${msg}`);
  }

  return result;
}

/**
 * 4. Execução Consolidada da Régua de Lifecycle (Renovação + Inadimplência + Cancelamentos)
 */
export async function runFullLifecycleScan(options?: {
  targetDate?: string;
  dryRun?: boolean;
  module?: 'all' | 'renewal' | 'delinquency' | 'cancellation';
  triggeredBy?: string;
}): Promise<FullLifecycleResult> {
  const startTime = Date.now();
  const dryRun = Boolean(options?.dryRun);
  const targetDate = options?.targetDate || new Date().toISOString().slice(0, 10);
  const selectedModule = options?.module || 'all';
  const triggeredBy = options?.triggeredBy || 'cron';

  let renewals: ScanResult = { scanned: 0, notified: 0, skipped: 0, errors: [] };
  let delinquency: ScanResult = { scanned: 0, notified: 0, skipped: 0, errors: [] };
  let cancellations: CancellationScanResult = { scanned: 0, canceled: 0, skipped: 0, errors: [] };

  if (selectedModule === 'all' || selectedModule === 'renewal') {
    renewals = await runRenewalScan({ targetDate, dryRun });
  }

  if (selectedModule === 'all' || selectedModule === 'delinquency') {
    delinquency = await runDelinquencyScan({ targetDate, dryRun });
  }

  if (selectedModule === 'all' || selectedModule === 'delinquency' || selectedModule === 'cancellation') {
    cancellations = await runDelinquencyCancellationScan({ targetDate, dryRun });
  }

  const durationMs = Date.now() - startTime;
  const allErrors = [...renewals.errors, ...delinquency.errors, ...cancellations.errors];

  const status: 'success' | 'partial' | 'failed' =
    allErrors.length === 0
      ? 'success'
      : renewals.notified > 0 || delinquency.notified > 0 || cancellations.canceled > 0
      ? 'partial'
      : 'failed';

  if (!dryRun) {
    try {
      await sql`
        INSERT INTO lifecycle_cron_logs (
          job_type, status, renewals_scanned, renewals_notified, renewals_skipped,
          delinquency_scanned, delinquency_notified, delinquency_skipped,
          errors, duration_ms, triggered_by
        ) VALUES (
          ${selectedModule},
          ${status},
          ${renewals.scanned},
          ${renewals.notified},
          ${renewals.skipped},
          ${delinquency.scanned + cancellations.scanned},
          ${delinquency.notified + cancellations.canceled},
          ${delinquency.skipped + cancellations.skipped},
          ${sql.json(allErrors)},
          ${durationMs},
          ${triggeredBy}
        )
      `;
    } catch (logErr) {
      logger.error({ logErr }, 'Falha ao registrar log de execução do cron lifecycle');
    }
  }

  return {
    ok: status !== 'failed',
    timestamp: new Date().toISOString(),
    targetDate,
    dryRun,
    durationMs,
    renewals,
    delinquency,
    cancellations,
    errors: allErrors,
  };
}
