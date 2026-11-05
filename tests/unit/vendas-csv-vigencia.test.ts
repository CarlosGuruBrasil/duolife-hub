import { describe, it, expect } from 'vitest';
import { gerarVendasCSV, VendaExportRow } from '@/lib/vendas-csv';

describe('vendas-csv-vigencia.test.ts - Geração de Relatório de Vendas com Vigência Correta', () => {
  it('deve exportar a coluna Vigência no formato canônico com início e fim (06/10/2026 — 05/10/2027)', () => {
    const vendas: VendaExportRow[] = [
      {
        id: 'sale-001',
        policy_number: 'DL-RC-ADV-35C1C140',
        importancia_segurada: 100000,
        premio_total: 310,
        commission_rate: 30.73,
        commission_amount: 95.26,
        status: 'ativa',
        issue_date: '2026-10-06',
        expiry_date: '2027-10-05',
        client_name: 'Dra. Maria Clara Fernandes',
        client_cpf_cnpj: '12345678909',
        product_name: 'RC Advogados',
        partner_name: 'NET4LIFE CORRETORA',
        client_data: {
          dataInicioVigencia: '2026-10-06',
          fimVigencia: '2027-10-05',
        },
      },
    ];

    const csv = gerarVendasCSV(vendas);
    const linhas = csv.split('\r\n');

    expect(linhas[0]).toBe('\uFEFFNº;Nome Segurado;Status;IS;Prêmio TOTAL;CPF Segurado;Vigência;Retroatividade;PremioNet;Renovação');
    
    const colunas = linhas[1].split(';');
    // Coluna 6 (0-indexed: 0=Nº, 1=Nome, 2=Status, 3=IS, 4=Prêmio, 5=CPF, 6=Vigência)
    expect(colunas[6]).toBe('"06/10/2026 — 05/10/2027"');
  });

  it('deve auto-calcular o término da vigência se expiry_date for nulo, usando o padrão SUSEP', () => {
    const vendas: VendaExportRow[] = [
      {
        id: 'sale-002',
        policy_number: 'DL-RC-ADV-99999999',
        premio_total: 500,
        issue_date: '2026-10-06',
        expiry_date: null,
        client_name: 'Dr. João Silva',
        client_cpf_cnpj: '98765432100',
        client_data: {
          dataInicioVigencia: '2026-10-06',
        },
      },
    ];

    const csv = gerarVendasCSV(vendas);
    const linhas = csv.split('\r\n');
    const colunas = linhas[1].split(';');
    expect(colunas[6]).toBe('"06/10/2026 — 05/10/2027"');
  });

  it('deve auto-corrigir registro gravado com erro de +1 ano exato (2026-10-06 a 2027-10-06)', () => {
    const vendas: VendaExportRow[] = [
      {
        id: 'sale-003',
        policy_number: 'DL-RC-ADV-88888888',
        premio_total: 500,
        issue_date: '2026-10-06',
        expiry_date: '2027-10-06', // Legado errado
        client_name: 'Dr. Lucas Santos',
        client_cpf_cnpj: '11122233344',
      },
    ];

    const csv = gerarVendasCSV(vendas);
    const linhas = csv.split('\r\n');
    const colunas = linhas[1].split(';');
    expect(colunas[6]).toBe('"06/10/2026 — 05/10/2027"');
  });

  it('deve fazer fallback para dataInicioVigencia ou created_at caso issue_date esteja ausente', () => {
    const vendas: VendaExportRow[] = [
      {
        id: 'sale-004',
        policy_number: 'DL-RC-ADV-77777777',
        premio_total: 500,
        issue_date: null,
        expiry_date: null,
        created_at: '2026-10-06T12:00:00Z',
        client_name: 'Dra. Ana Paula',
        client_cpf_cnpj: '55566677788',
        client_data: {
          dataInicioVigencia: '2026-10-06',
        },
      },
    ];

    const csv = gerarVendasCSV(vendas);
    const linhas = csv.split('\r\n');
    const colunas = linhas[1].split(';');
    expect(colunas[6]).toBe('"06/10/2026 — 05/10/2027"');
  });
});
