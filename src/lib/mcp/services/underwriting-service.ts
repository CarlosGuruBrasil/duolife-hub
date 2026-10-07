import { RamoConfig } from '@/lib/product-schemas';

export interface UnderwritingAnalysisResult {
  status: 'approved' | 'manual_review_required' | 'pending_details';
  reasonCodes: string[];
  descriptions: string[];
  missingDetails: string[];
}

/**
 * Avaliador Determinístico Server-Side de Underwriting e Risco Declarativo.
 * 
 * Regra Arquitetural Inegociável:
 * A IA nunca decide subjetivamente se um risco é aceitável ou não.
 * Este serviço analisa deterministicamente o questionário de risco do ramo
 * e retorna se a proposta é elegível para aprovação automática ou se requer
 * transbordo para revisão manual por um subscritor da DuoLife.
 */
export function evaluateUnderwriting(
  ramo: RamoConfig,
  collectedData: Record<string, any>
): UnderwritingAnalysisResult {
  const reasonCodes: string[] = [];
  const descriptions: string[] = [];
  const missingDetails: string[] = [];

  const isPlano100k =
    String(collectedData.tipoDePlano || collectedData.tipo || '').toLowerCase() === '100k';

  // 1. Verificação de Pessoa Politicamente Exposta (PPE)
  if (
    collectedData.ppeCargos === 'Sim' ||
    collectedData.ppeRepresenta === 'Sim'
  ) {
    reasonCodes.push('PPE_AFFIRMATIVE');
    descriptions.push('Proponente ou pessoa próxima declarou cargo público de PPE.');
  }

  // 2. Análise do Questionário de Risco do Ramo
  for (const q of ramo.questionarioRisco) {
    const answer = collectedData[q.id];
    const detail = collectedData[q.detailKey];

    if (answer === 'Sim') {
      // Se a resposta for Sim, verifica se o detalhe obrigatório foi preenchido
      if (
        q.requiredOnAffirmative !== false &&
        (!detail || String(detail).trim().length < 5) &&
        !(isPlano100k && ramo.ramoId === 'rc-advogados')
      ) {
        missingDetails.push(q.detailKey);
      }

      // Mapeamento semântico do código de motivo
      const idUpper = q.id.toUpperCase();
      if (idUpper.includes('RECLAMACAO') || idUpper.includes('PAGOU')) {
        reasonCodes.push('PRIOR_PROFESSIONAL_CLAIM');
        descriptions.push('Histórico declarado de reclamação ou indenização profissional prévia.');
      } else if (idUpper.includes('RECUSADA') || idUpper.includes('RECUSA')) {
        reasonCodes.push('PRIOR_REFUSAL');
        descriptions.push('Declaração de proposta de seguro recusada anteriormente por outra seguradora.');
      } else if (idUpper.includes('INVESTIGACAO') || idUpper.includes('CONSELHO')) {
        reasonCodes.push('PRIOR_DISCIPLINARY');
        descriptions.push('Declaração de processo disciplinar ou inquérito em conselho profissional.');
      } else if (idUpper.includes('FATO') || idUpper.includes('TERCEIRO')) {
        reasonCodes.push('FACTS_THIRD_PARTY');
        descriptions.push('Conhecimento prévio de fatos suscetíveis a reclamação futura.');
      } else {
        reasonCodes.push(`RISK_AFFIRMATIVE_${q.id.toUpperCase()}`);
        descriptions.push(`Declaração afirmativa de risco: ${q.question}`);
      }
    }
  }

  // 3. Resolução do Status
  if (missingDetails.length > 0) {
    return {
      status: 'pending_details',
      reasonCodes,
      descriptions,
      missingDetails,
    };
  }

  if (reasonCodes.length > 0) {
    return {
      status: 'manual_review_required',
      reasonCodes: Array.from(new Set(reasonCodes)),
      descriptions: Array.from(new Set(descriptions)),
      missingDetails: [],
    };
  }

  return {
    status: 'approved',
    reasonCodes: [],
    descriptions: [],
    missingDetails: [],
  };
}
