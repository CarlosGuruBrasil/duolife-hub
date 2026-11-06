import { describe, it, expect } from 'vitest';
import {
  calcularVencimentosRestantes,
  addMonthsPreservingDay,
} from '@/lib/vencimento-sequencial';

describe('Vencimento Sequencial para Parcelas Restantes', () => {
  it('deve reproduzir com exatidão o exemplo da regra de negócio', () => {
    // Exemplo: Cobrança em 4x com 2 parcelas pagas (02/10/2026 e 02/11/2026)
    // Próximas 2 restantes devem ser 02/12/2026 e 02/01/2027
    const result = calcularVencimentosRestantes({
      totalParcelas: 4,
      qtdParcelasRestantes: 2,
      parcelasPagas: [
        { numero: 1, due_date: '2026-10-02', status: 'paid' },
        { numero: 2, due_date: '2026-11-02', status: 'paid' },
      ],
      minDate: '2026-11-06',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      numero: 3,
      dueDate: '2026-12-02',
      dueDateFormatted: '02/12/2026',
    });
    expect(result[1]).toEqual({
      numero: 4,
      dueDate: '2027-01-02',
      dueDateFormatted: '02/01/2027',
    });
  });

  it('deve lidar corretamente com planos de 6x com 1 parcela paga', () => {
    const result = calcularVencimentosRestantes({
      totalParcelas: 6,
      qtdParcelasRestantes: 5,
      parcelasPagas: [
        { numero: 1, due_date: '2026-10-15', status: 'paid' },
      ],
      minDate: '2026-11-06',
    });

    expect(result).toHaveLength(5);
    expect(result[0].dueDate).toBe('2026-11-15');
    expect(result[0].numero).toBe(2);
    expect(result[1].dueDate).toBe('2026-12-15');
    expect(result[2].dueDate).toBe('2027-01-15');
    expect(result[3].dueDate).toBe('2027-02-15');
    expect(result[4].dueDate).toBe('2027-03-15');
  });

  it('deve ajustar para dia 28/29 de fevereiro quando o dia for 31', () => {
    const date31Jan = new Date(2027, 0, 31, 12, 0, 0); // 31 Jan 2027 (não bissexto)
    const febDate = addMonthsPreservingDay(date31Jan, 1);
    expect(febDate.getDate()).toBe(28);
    expect(febDate.getMonth()).toBe(1); // Fevereiro
  });

  it('deve salvaguardar datas que ficariam no passado ajustando a primeira para D+2 dias úteis', () => {
    // Cenário: última parcela paga venceu há 3 meses (2026-07-05)
    // A próxima calculada (2026-08-05) já passou em relação a minDate=2026-11-06
    const result = calcularVencimentosRestantes({
      totalParcelas: 3,
      qtdParcelasRestantes: 1,
      parcelasPagas: [
        { numero: 1, due_date: '2026-07-05', status: 'paid' },
      ],
      minDate: '2026-11-06', // Sexta-feira
    });

    expect(result).toHaveLength(1);
    // D+2 dias úteis a partir de sexta 06/11 -> terça 10/11
    expect(result[0].dueDate).toBe('2026-11-10');
  });

  it('deve retornar array vazio se qtdParcelasRestantes for 0', () => {
    const result = calcularVencimentosRestantes({
      totalParcelas: 4,
      qtdParcelasRestantes: 0,
      parcelasPagas: [{ numero: 1, due_date: '2026-10-02' }],
    });
    expect(result).toEqual([]);
  });
});
