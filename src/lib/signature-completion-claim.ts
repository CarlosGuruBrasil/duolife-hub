import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

/**
 * Trava atômica dos efeitos de conclusão de assinatura de um contrato ZapSign.
 *
 * Efeitos protegidos: gatilho CONTRATO_ASSINADO (e-mails ao cliente/vendedor) e geração
 * automática da cobrança Asaas. Todos os caminhos que concluem uma assinatura (webhook,
 * reprocessamento, cron de recuperação e verificação manual no portal) reivindicam a mesma
 * linha em `signature_completion_claims`; somente quem a insere executa os efeitos.
 *
 * O INSERT ... ON CONFLICT DO NOTHING é atômico no Postgres, então dois processos concorrentes
 * (ex.: webhook atrasado chegando durante a execução do cron) nunca disparam os efeitos duas vezes.
 */

export type SignatureCompletionSource =
  | 'webhook'
  | 'webhook_reprocess'
  | 'recovery_cron'
  | 'portal_verificar';

export type SignatureCompletionClaimOutcome = 'claimed' | 'already_claimed' | 'error';

export interface SignatureCompletionClaimInput {
  signatureDocumentId: string;
  cotacaoId: string;
  externalDocumentId?: string | null;
  source: SignatureCompletionSource;
}

export async function claimSignatureCompletionEffects(
  input: SignatureCompletionClaimInput
): Promise<SignatureCompletionClaimOutcome> {
  try {
    const rows = await sql<{ signature_document_id: string }[]>`
      INSERT INTO signature_completion_claims (
        signature_document_id,
        cotacao_id,
        external_document_id,
        source
      )
      VALUES (
        ${input.signatureDocumentId},
        ${input.cotacaoId},
        ${input.externalDocumentId || null},
        ${input.source}
      )
      ON CONFLICT (signature_document_id) DO NOTHING
      RETURNING signature_document_id
    `;

    if (rows.length > 0) {
      logger.info(
        { cotacaoId: input.cotacaoId, signatureDocumentId: input.signatureDocumentId, source: input.source },
        'signature.completion.claimed'
      );
      return 'claimed';
    }

    logger.info(
      { cotacaoId: input.cotacaoId, signatureDocumentId: input.signatureDocumentId, source: input.source },
      'signature.completion.already_claimed'
    );
    return 'already_claimed';
  } catch (err) {
    logger.error(
      { err, cotacaoId: input.cotacaoId, signatureDocumentId: input.signatureDocumentId, source: input.source },
      'signature.completion.claim_failed'
    );
    return 'error';
  }
}

/**
 * Decide se os efeitos devem rodar a partir do resultado da reivindicação.
 *
 * - `claimed`         → executa.
 * - `already_claimed` → NÃO executa (outro caminho já disparou e-mails/cobrança).
 * - `error`           → depende do modo: o webhook é fail-open (preserva o comportamento atual
 *                       se a tabela estiver indisponível); o cron é fail-closed (contingência
 *                       nunca arrisca duplicidade).
 */
export function shouldRunCompletionEffects(
  outcome: SignatureCompletionClaimOutcome,
  mode: 'fail_open' | 'fail_closed' = 'fail_open'
): boolean {
  if (outcome === 'claimed') return true;
  if (outcome === 'already_claimed') return false;
  return mode === 'fail_open';
}
