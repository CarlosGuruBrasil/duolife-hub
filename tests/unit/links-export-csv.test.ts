import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gerarLinksCsv, CABECALHO_LINKS_CSV, type SaleLinkExportRow } from '@/lib/links-csv';
import { GET } from '../../app/api/portal/links/exportar/route';
import { NextRequest } from 'next/server';

const { mockSql, mockVerifyPartnerAuth } = vi.hoisted(() => {
  const sqlFn: any = vi.fn();
  sqlFn.unsafe = vi.fn();
  sqlFn.json = (val: any) => JSON.stringify(val);
  return {
    mockSql: sqlFn,
    mockVerifyPartnerAuth: vi.fn(),
  };
});

vi.mock('@/lib/pg', () => ({
  sql: mockSql,
}));

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: mockVerifyPartnerAuth,
  canManageOwnCompany: vi.fn(() => true),
  unauthorized: () => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 }),
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('links-export-csv.test.ts - Exportação e Relatório de Links de Venda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gerarLinksCsv - Geração de Arquivo CSV', () => {
    const mockRows: SaleLinkExportRow[] = [
      {
        id: 'link-1',
        token: 'token-geral-123',
        label: 'Campanha Black Friday',
        status: 'active',
        discount_percent: 15,
        is_exclusive: false,
        target_document: null,
        target_name: null,
        max_uses: null,
        used_count: 5,
        views_count: 100,
        unique_views_count: 80,
        total_cotacoes: 20,
        total_vendas: 10,
        conversion_rate_cotacao: 25.0,
        conversion_rate_venda: 12.5,
        fechamento_rate: 50.0,
        created_at: new Date('2026-10-01T10:00:00Z'),
        last_accessed_at: new Date('2026-10-25T14:30:00Z'),
        expires_at: null,
        product_name: 'RC Advogados',
        product_code: 'RC-ADV-001',
        url: 'https://duolife.com.br/contratar/token-geral-123',
      },
      {
        id: 'link-2',
        token: 'token-exclusivo-456',
        label: 'Proposta Dr. Marcos',
        status: 'used',
        discount_percent: 20,
        is_exclusive: true,
        target_document: '12345678901',
        target_name: 'Dr. Marcos Valério',
        max_uses: 1,
        used_count: 1,
        views_count: 3,
        unique_views_count: 1,
        total_cotacoes: 1,
        total_vendas: 1,
        conversion_rate_cotacao: 100.0,
        conversion_rate_venda: 100.0,
        fechamento_rate: 100.0,
        created_at: new Date('2026-10-15T09:00:00Z'),
        last_accessed_at: new Date('2026-10-15T09:10:00Z'),
        expires_at: new Date('2026-10-22T23:59:59Z'),
        product_name: 'RC Médicos',
        product_code: 'RC-MED-001',
        url: 'https://duolife.com.br/contratar/token-exclusivo-456',
      },
    ];

    it('deve conter o cabeçalho correto e o prefixo UTF-8 BOM', () => {
      const csv = gerarLinksCsv(mockRows);

      // Inicia com o BOM UTF-8 (\uFEFF) para compatibilidade nativa com Excel
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // Contém todas as colunas canônicas
      for (const col of CABECALHO_LINKS_CSV) {
        expect(csv).toContain(col);
      }
    });

    it('deve formatar links gerais e exclusivos com métricas e máscaras adequadas', () => {
      const csv = gerarLinksCsv(mockRows);
      const lines = csv.split('\r\n');

      expect(lines.length).toBe(3); // 1 header + 2 linhas

      // Linha 1: Link Geral
      const linhaGeral = lines[1];
      expect(linhaGeral).toContain('"Campanha Black Friday"');
      expect(linhaGeral).toContain('"Geral (Público)"');
      expect(linhaGeral).toContain('"RC Advogados (RC-ADV-001)"');
      expect(linhaGeral).toContain('"15%"');
      expect(linhaGeral).toContain('"Ilimitado"');
      expect(linhaGeral).toContain('"100"'); // views
      expect(linhaGeral).toContain('"80"'); // unique views
      expect(linhaGeral).toContain('"20"'); // cotacoes
      expect(linhaGeral).toContain('"10"'); // vendas
      expect(linhaGeral).toContain('"25,0%"'); // tx cotacao
      expect(linhaGeral).toContain('"12,5%"'); // tx venda
      expect(linhaGeral).toContain('"50,0%"'); // tx fechamento

      // Linha 2: Link Exclusivo
      const linhaExclusiva = lines[2];
      expect(linhaExclusiva).toContain('"Proposta Dr. Marcos"');
      expect(linhaExclusiva).toContain('"Exclusivo (Cliente Específico)"');
      expect(linhaExclusiva).toContain('"123.456.789-01"'); // CPF mascarado
      expect(linhaExclusiva).toContain('"Dr. Marcos Valério"');
      expect(linhaExclusiva).toContain('"Esgotado / Utilizado"');
      expect(linhaExclusiva).toContain('"1"'); // max uses
      expect(linhaExclusiva).toContain('"100,0%"');
    });

    it('deve lidar com caracteres especiais e aspas duplas sem quebrar o layout', () => {
      const rowWithQuotes: SaleLinkExportRow = {
        id: 'link-3',
        token: 'token-quotes',
        label: 'Campanha "Verão" 2026; Especial',
        status: 'active',
      };

      const csv = gerarLinksCsv([rowWithQuotes]);
      // Aspas duplas devem ser escapadas para ""
      expect(csv).toContain('"Campanha ""Verão"" 2026; Especial"');
    });
  });

  describe('Endpoint GET /api/portal/links/exportar', () => {
    it('deve retornar 401 caso o usuário não esteja autenticado no Portal', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost:3000/api/portal/links/exportar');
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    it('deve retornar arquivo CSV com os headers corretos para download pelo navegador', async () => {
      mockVerifyPartnerAuth.mockResolvedValueOnce({
        userId: 'user-001',
        partnerId: 'partner-001',
        role: 'partner',
      });

      mockSql.mockResolvedValue([
        {
          id: 'link-test',
          token: 'token-abc',
          label: 'Meu Link de Teste',
          status: 'active',
          discount_percent: 10,
          is_exclusive: false,
          views_count: 50,
          unique_views_count: 40,
          total_cotacoes: 5,
          total_vendas: 2,
          created_at: new Date('2026-10-20T12:00:00Z'),
          product_name: 'RC Advogados',
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/portal/links/exportar');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="relatorio_links_vendas_');

      const body = await res.text();
      expect(body).toContain('"Meu Link de Teste"');
      expect(body).toContain('"token-abc"');
      expect(body).toContain('"Geral (Público)"');
    });
  });
});
