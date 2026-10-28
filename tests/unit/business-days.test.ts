import { describe, it, expect } from 'vitest';
import {
  calculateBillingDueDate,
  isBusinessDay,
  addBusinessDays,
  parseDateSafe,
  compareDatesOnly,
} from '@/lib/business-days';

describe('business-days.ts - Regras de Dias Úteis e Feriados Brasileiros', () => {
  it('deve identificar fins de semana como dias não úteis', () => {
    // 2026-09-19 = Sábado, 2026-09-20 = Domingo
    const sabado = new Date(2026, 8, 19, 12, 0, 0);
    const domingo = new Date(2026, 8, 20, 12, 0, 0);
    expect(isBusinessDay(sabado)).toBe(false);
    expect(isBusinessDay(domingo)).toBe(false);
  });

  it('deve identificar dias úteis regulares', () => {
    // 2026-09-21 = Segunda-feira (sem feriado)
    // 2026-09-22 = Terça-feira (sem feriado)
    const segunda = new Date(2026, 8, 21, 12, 0, 0);
    const terca = new Date(2026, 8, 22, 12, 0, 0);
    expect(isBusinessDay(segunda)).toBe(true);
    expect(isBusinessDay(terca)).toBe(true);
  });

  it('deve reconhecer feriados nacionais fixos', () => {
    // Natal: 25/12
    const natal = new Date(2026, 11, 25, 12, 0, 0);
    expect(isBusinessDay(natal)).toBe(false);

    // Consciência Negra: 20/11 (Lei 14.759/2023)
    const conscienciaNegra = new Date(2026, 10, 20, 12, 0, 0);
    expect(isBusinessDay(conscienciaNegra)).toBe(false);

    // Tiradentes: 21/04
    const tiradentes = new Date(2026, 3, 21, 12, 0, 0);
    expect(isBusinessDay(tiradentes)).toBe(false);

    // Independência: 07/09
    const independencia = new Date(2026, 8, 7, 12, 0, 0);
    expect(isBusinessDay(independencia)).toBe(false);
  });

  it('deve reconhecer feriados nacionais móveis baseados na Páscoa', () => {
    // Em 2026: Sexta-feira Santa é 03/04/2026, Corpus Christi é 04/06/2026
    const sextaSanta2026 = new Date(2026, 3, 3, 12, 0, 0);
    const corpusChristi2026 = new Date(2026, 5, 4, 12, 0, 0);
    expect(isBusinessDay(sextaSanta2026)).toBe(false);
    expect(isBusinessDay(corpusChristi2026)).toBe(false);
  });

  it('deve somar dias úteis pulando finais de semana corretamente com addBusinessDays', () => {
    // Sexta-feira 18/09/2026 + 2 dias úteis -> Terça-feira 22/09/2026
    const res = addBusinessDays('2026-09-18', 2);
    expect(res).toBe('2026-09-22');
  });

  it('deve comparar datas apenas considerando dia (YYYY-MM-DD)', () => {
    expect(compareDatesOnly('2026-09-22T10:00:00Z', '2026-09-22T23:59:59Z')).toBe(0);
    expect(compareDatesOnly('2026-09-21', '2026-09-22')).toBeLessThan(0);
    expect(compareDatesOnly('2026-09-23', '2026-09-22')).toBeGreaterThan(0);
  });
});

describe('business-days.ts - calculateBillingDueDate (Regras de Vencimento e Emissão)', () => {
  it('Cenário 1: Vigência futura deve permitir emissão para vendedor com vencimento em vigência + 2 dias úteis', () => {
    // Sexta 25/09/2026, hoje 22/09/2026 -> vencimento 29/09/2026 (terça, pulando sábado e domingo)
    const res = calculateBillingDueDate({
      rawVigencia: '2026-09-25',
      todayDate: '2026-09-22',
      isManualAdmin: false,
    });

    expect(res.ok).toBe(true);
    expect(res.dueDate).toBe('2026-09-29');
    expect(res.reason).toBe('normal');
    expect(res.isPastVigencia).toBe(false);
    expect(res.vigenciaIso).toBe('2026-09-25');
  });

  it('Cenário 2: Vigência hoje deve permitir emissão para vendedor com vencimento em hoje + 2 dias úteis', () => {
    // Terça 22/09/2026, hoje 22/09/2026 -> vencimento 24/09/2026 (quinta)
    const res = calculateBillingDueDate({
      rawVigencia: '2026-09-22',
      todayDate: '2026-09-22',
      isManualAdmin: false,
    });

    expect(res.ok).toBe(true);
    expect(res.dueDate).toBe('2026-09-24');
    expect(res.reason).toBe('normal');
    expect(res.isPastVigencia).toBe(false);
  });

  it('Cenário 3: Vigência atrasada, mas contrato assinado em até 2 dias úteis (late_signed_on_time) -> Vendedor permitido', () => {
    // Vigência 21/09/2026 (segunda), assinado 22/09/2026 (terça - 1 dia útil após vigência)
    // Vencimento = assinatura + 2 dias úteis = 24/09/2026
    const res = calculateBillingDueDate({
      rawVigencia: '2026-09-21',
      rawAssinatura: '2026-09-22T14:30:00.000Z',
      todayDate: '2026-09-22',
      isManualAdmin: false,
    });

    expect(res.ok).toBe(true);
    expect(res.dueDate).toBe('2026-09-24');
    expect(res.reason).toBe('late_signed_on_time');
    expect(res.isPastVigencia).toBe(true);
    expect(res.isAssinadoNoPrazo).toBe(true);
  });

  it('Cenário 4: Vigência sexta-feira, assinado na terça-feira (exatos 2 dias úteis com fim de semana no meio) -> Vendedor permitido', () => {
    // Vigência 18/09/2026 (sexta), 18/09 + 2 dias úteis = 22/09/2026 (terça)
    // Assinado 22/09/2026 -> vencimento = assinatura + 2 dias úteis = 24/09/2026
    const res = calculateBillingDueDate({
      rawVigencia: '2026-09-18',
      rawAssinatura: '2026-09-22',
      todayDate: '2026-09-22',
      isManualAdmin: false,
    });

    expect(res.ok).toBe(true);
    expect(res.dueDate).toBe('2026-09-24');
    expect(res.reason).toBe('late_signed_on_time');
    expect(res.isAssinadoNoPrazo).toBe(true);
    expect(res.maxAssinaturaToleradaIso).toBe('2026-09-22');
  });

  it('Cenário 5: Vigência atrasada e assinado fora do prazo de 2 dias úteis -> Bloqueia vendedor, permite admin override', () => {
    // Vigência 18/09/2026, limite tolerado era 22/09. Assinado em 23/09 (3 dias úteis depois)
    // Vendedor:
    const resVendor = calculateBillingDueDate({
      rawVigencia: '2026-09-18',
      rawAssinatura: '2026-09-23',
      todayDate: '2026-09-23',
      isManualAdmin: false,
    });
    expect(resVendor.ok).toBe(false);
    expect(resVendor.reason).toBe('blocked_late_signature');
    expect(resVendor.error).toContain('ultrapassou o limite de 2 dias úteis');

    // Admin:
    const resAdmin = calculateBillingDueDate({
      rawVigencia: '2026-09-18',
      rawAssinatura: '2026-09-23',
      todayDate: '2026-09-23',
      isManualAdmin: true,
    });
    expect(resAdmin.ok).toBe(true);
    expect(resAdmin.reason).toBe('admin_override');
    // Admin override: vencimento = hoje + 2 dias úteis (23/09 quarta + 2 dias úteis = 25/09 sexta)
    expect(resAdmin.dueDate).toBe('2026-09-25');
  });

  it('Cenário 6: Vigência atrasada e contrato não assinado -> Bloqueia vendedor, permite admin override', () => {
    // Vendedor:
    const resVendor = calculateBillingDueDate({
      rawVigencia: '2026-09-18',
      rawAssinatura: null,
      todayDate: '2026-09-22',
      isManualAdmin: false,
    });
    expect(resVendor.ok).toBe(false);
    expect(resVendor.reason).toBe('blocked_not_signed');
    expect(resVendor.error).toContain('é anterior à data atual');

    // Admin:
    const resAdmin = calculateBillingDueDate({
      rawVigencia: '2026-09-18',
      rawAssinatura: null,
      todayDate: '2026-09-22',
      isManualAdmin: true,
    });
    expect(resAdmin.ok).toBe(true);
    expect(resAdmin.reason).toBe('admin_override');
    expect(resAdmin.dueDate).toBe('2026-09-24'); // 22/09 + 2 dias úteis
  });

  it('Cenário 7: Salvaguarda quando vencimento da fatura prescreveu no tempo (evita HTTP 400 no Asaas)', () => {
    // Vigência 01/09/2026, assinado 02/09/2026 (dentro do prazo da vigência).
    // Vencimento original da assinatura seria 04/09/2026. Porém hoje já é 22/09/2026!
    const resVendor = calculateBillingDueDate({
      rawVigencia: '2026-09-01',
      rawAssinatura: '2026-09-02',
      todayDate: '2026-09-22',
      isManualAdmin: false,
    });
    expect(resVendor.ok).toBe(false);
    expect(resVendor.reason).toBe('blocked_expired_due_date');
    expect(resVendor.error).toContain('já expirou. Solicite a um administrador');

    // Admin pode emitir ajustando para hoje + 2 dias úteis
    const resAdmin = calculateBillingDueDate({
      rawVigencia: '2026-09-01',
      rawAssinatura: '2026-09-02',
      todayDate: '2026-09-22',
      isManualAdmin: true,
    });
    expect(resAdmin.ok).toBe(true);
    expect(resAdmin.reason).toBe('admin_override');
    expect(resAdmin.dueDate).toBe('2026-09-24');
  });
});
