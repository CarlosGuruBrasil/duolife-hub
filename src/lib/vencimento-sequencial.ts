/**
 * Utilitário de cálculo de vencimento sequencial para faturas residuais/restantes.
 * Regra: O vencimento segue baseado nos vencimentos das parcelas pagas.
 * Exemplo: Se em 4x houve 2 pagas (02/10/2026 e 02/11/2026), as 2 restantes serão 02/12/2026 e 02/01/2027.
 */

import { parseDateSafe, formatToISODate, getTodayISODate, addBusinessDays, compareDatesOnly } from './business-days';

export interface ParcelaHistorico {
  numero: number;
  due_date: string | Date;
  paid_at?: string | Date | null;
  status?: string;
  amount?: number;
}

export interface ParcelaProjetada {
  numero: number;
  dueDate: string; // YYYY-MM-DD
  dueDateFormatted: string; // DD/MM/AAAA
}

export interface CalcularVencimentosRestantesParams {
  parcelasPagas: ParcelaHistorico[];
  totalParcelas: number;
  qtdParcelasRestantes: number;
  dataBaseFallback?: string | Date | null;
  minDate?: string; // Data mínima para envio ao gateway (default: hoje)
}

/**
 * Adiciona meses mantendo o mesmo dia do mês (com ajuste para o último dia caso o mês de destino tenha menos dias).
 */
export function addMonthsPreservingDay(baseDate: Date, monthsToAdd: number): Date {
  const target = new Date(baseDate.getTime());
  const originalDay = baseDate.getDate();

  // Define dia 1 temporariamente para evitar overflow automático do JS (ex: 31 Jan + 1 mês -> 3 Mar)
  target.setDate(1);
  target.setMonth(target.getMonth() + monthsToAdd);

  // Descobre o último dia do mês de destino
  const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const finalDay = Math.min(originalDay, lastDayOfMonth);

  target.setDate(finalDay);
  return target;
}

function formatBr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Calcula as datas de vencimento de parcelas faltantes de forma sequencial.
 */
export function calcularVencimentosRestantes(
  params: CalcularVencimentosRestantesParams
): ParcelaProjetada[] {
  const { parcelasPagas, totalParcelas, qtdParcelasRestantes } = params;

  if (qtdParcelasRestantes <= 0) return [];

  const todayStr = params.minDate || getTodayISODate();

  // 1. Identifica a parcela âncora a partir do histórico de parcelas pagas
  let anchorDate: Date | null = null;
  let anchorInstallmentNum = 0;

  if (parcelasPagas && parcelasPagas.length > 0) {
    // Ordena as parcelas pagas por número crescente
    const sorted = [...parcelasPagas].sort((a, b) => (a.numero || 0) - (b.numero || 0));
    const lastPaid = sorted[sorted.length - 1];

    anchorDate = parseDateSafe(lastPaid.due_date);
    anchorInstallmentNum = lastPaid.numero || sorted.length;
  }

  // Fallback caso não haja nenhuma parcela paga registrada ainda
  if (!anchorDate) {
    const rawFallback = params.dataBaseFallback || todayStr;
    anchorDate = parseDateSafe(rawFallback) || parseDateSafe(todayStr)!;
    anchorInstallmentNum = 0;
  }

  const result: ParcelaProjetada[] = [];

  for (let i = 1; i <= qtdParcelasRestantes; i++) {
    const installmentNumber = anchorInstallmentNum + i;

    // Adiciona i meses à data âncora
    const projectedDate = addMonthsPreservingDay(anchorDate, i);
    let projectedIso = formatToISODate(projectedDate);

    // Salvaguarda: a API do gateway (Asaas) rejeita cobranças com dueDate no passado.
    // Se a data projetada calculada for anterior à data mínima (hoje), ajustamos para hoje + 2 dias úteis
    if (compareDatesOnly(projectedIso, todayStr) < 0) {
      projectedIso = addBusinessDays(todayStr, 2);
    }

    result.push({
      numero: installmentNumber <= totalParcelas ? installmentNumber : i,
      dueDate: projectedIso,
      dueDateFormatted: formatBr(projectedIso),
    });
  }

  return result;
}
