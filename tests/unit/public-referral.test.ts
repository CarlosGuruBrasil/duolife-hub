import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.unsafe = vi.fn();
  sqlMock.json = (val: any) => JSON.stringify(val);
  return { sql: sqlMock };
});

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

import { sql } from '@/lib/pg';
import { resolvePartnerOrLink } from '@/lib/referral';
import { GET } from '@/../app/api/public/referral/route';

describe('public-referral.test.ts - Resolução de Indicação Pública e Emissão de Cookie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPublicLinkRow = {
    link_id: 'link_1001',
    token: 'dlk_superdesconto15',
    product_id: 'prod_rc_medico',
    discount_percent: 15,
    partner_id: 'partner_001',
    razao_social: 'CORRETORA SILVA E FILHOS LTDA',
    nome_fantasia: 'Silva Seguros',
    email: 'contato@silvaseguros.com.br',
    phone: '11999998888',
    status: 'active',
    partner_metadata: {
      whiteLabel: {
        wixCode: 'SILVA15',
        slug: 'silva-seguros',
        companyName: 'Silva Seguros WhiteLabel',
        logoUrl: 'https://duolife.com.br/logos/silva.png',
        primaryColor: '#0e4a5a',
      },
    },
    corretora_metadata: null,
  };

  const mockPartnerRow = {
    id: 'partner_002',
    razao_social: 'ALMEIDA CORRETAGEM LTDA',
    nome_fantasia: 'Almeida Benefícios',
    email: 'contato@almeida.com.br',
    phone: '47999997777',
    status: 'active',
    metadata: {
      whiteLabel: {
        wixCode: 'ALMEIDA10',
        slug: 'almeida',
        companyName: 'Almeida Corretora',
        logoUrl: 'https://duolife.com.br/logos/almeida.png',
        primaryColor: '#10b981',
      },
    },
    corretora_metadata: null,
  };

  const mockPartnerSaleLinkRow = {
    id: 'link_2002',
    token: 'dlk_almeida_active_token',
    partner_id: 'partner_002',
    metadata: {},
    discount_percent: 10,
  };

  describe('1. Função resolvePartnerOrLink (src/lib/referral.ts)', () => {
    it('deve resolver link por token público com discount_percent preenchido da 1ª tentativa', async () => {
      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl')) {
          return [mockPublicLinkRow];
        }
        return [];
      });

      const res = await resolvePartnerOrLink('dlk_superdesconto15');
      expect(res).not.toBeNull();
      expect(res?.token).toBe('dlk_superdesconto15');
      expect(res?.discountPercent).toBe(15);
      expect(res?.partner.code).toBe('SILVA15');
      expect(res?.partner.razaoSocial).toBe('CORRETORA SILVA E FILHOS LTDA');
      expect(res?.partner.nomeFantasia).toBe('Silva Seguros');
    });

    it('deve resolver parceiro por código (wixCode) e carregar link de venda com discount_percent', async () => {
      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl') && query.includes('WHERE pl.token =')) {
          return []; // Não dá match na 1ª tentativa
        }
        if (query.includes('FROM partners p') && query.includes('corretoras c')) {
          return [mockPartnerRow]; // Dá match na 2ª tentativa
        }
        if (query.includes('FROM public_sale_links') && query.includes('partner_id =')) {
          return [mockPartnerSaleLinkRow]; // Link existente do parceiro
        }
        if (query.includes('FROM partners') && query.includes('WHERE id =')) {
          return [{ id: mockPartnerRow.id, metadata: mockPartnerRow.metadata }];
        }
        return [];
      });

      const res = await resolvePartnerOrLink('ALMEIDA10');
      expect(res).not.toBeNull();
      expect(res?.token).toBe('dlk_almeida_active_token');
      expect(res?.discountPercent).toBe(10);
      expect(res?.partner.code).toBe('ALMEIDA10');
      expect(res?.partner.razaoSocial).toBe('ALMEIDA CORRETAGEM LTDA');
      expect(res?.partner.nomeFantasia).toBe('Almeida Benefícios');
    });

    it('deve retornar discountPercent = 0 quando criar novo link na resolução de parceiro', async () => {
      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl') && query.includes('WHERE pl.token =')) {
          return [];
        }
        if (query.includes('FROM partners p') && query.includes('corretoras c')) {
          return [mockPartnerRow];
        }
        if (query.includes('FROM public_sale_links') && query.includes('partner_id =')) {
          return []; // Sem link existente
        }
        if (query.includes('FROM partners') && query.includes('WHERE id =')) {
          return [{ id: mockPartnerRow.id, metadata: mockPartnerRow.metadata }];
        }
        if (query.includes('INSERT INTO public_sale_links')) {
          return [{ id: 'link_new_999', token: 'dlk_new_token_auto' }];
        }
        return [];
      });

      const res = await resolvePartnerOrLink('ALMEIDA10');
      expect(res).not.toBeNull();
      expect(res?.token).toBe('dlk_new_token_auto');
      expect(res?.discountPercent).toBe(0);
    });

    it('deve retornar null se o código ou token não for encontrado', async () => {
      (sql as any).mockResolvedValue([]);
      const res = await resolvePartnerOrLink('CODIGO_INEXISTENTE');
      expect(res).toBeNull();
    });
  });

  describe('2. Rota GET /api/public/referral', () => {
    it('deve retornar 200 com payload correto ao buscar por ?ref=[token]', async () => {
      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl')) {
          return [mockPublicLinkRow];
        }
        return [];
      });

      const req = new NextRequest('https://duolife.com.br/api/public/referral?ref=dlk_superdesconto15');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toEqual({
        ok: true,
        referral: {
          code: 'SILVA15',
          partnerName: 'Silva Seguros',
          companyName: 'Silva Seguros WhiteLabel',
          logoUrl: 'https://duolife.com.br/logos/silva.png',
          primaryColor: '#0e4a5a',
          directUrl: 'https://duolife.com.br/contratar/dlk_superdesconto15',
          discountPercent: 15,
          token: 'dlk_superdesconto15',
        },
      });
    });

    it('deve emitir o cabeçalho Set-Cookie duolife_ref com duração de 30 dias (Max-Age=2592000; Path=/; SameSite=Lax)', async () => {
      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl')) {
          return [mockPublicLinkRow];
        }
        return [];
      });

      const req = new NextRequest('https://duolife.com.br/api/public/referral?ref=dlk_superdesconto15');
      const res = await GET(req);

      expect(res.status).toBe(200);

      // Verificação via response.headers.get('set-cookie')
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('duolife_ref=SILVA15');
      expect(setCookie).toMatch(/Max-Age=2592000/i);
      expect(setCookie).toMatch(/Path=\//i);
      expect(setCookie).toMatch(/SameSite=lax/i);

      // Verificação via cookies da resposta
      const cookieObj = res.cookies.get('duolife_ref');
      expect(cookieObj).toBeDefined();
      expect(cookieObj?.value).toBe('SILVA15');
      expect(cookieObj?.maxAge).toBe(2592000);
      expect(cookieObj?.path).toBe('/');
      expect(String(cookieObj?.sameSite).toLowerCase()).toBe('lax');
    });

    it('deve aceitar parâmetro alternativo ?code=[codigo] com sucesso', async () => {
      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl') && query.includes('WHERE pl.token =')) {
          return [];
        }
        if (query.includes('FROM partners p') && query.includes('corretoras c')) {
          return [mockPartnerRow];
        }
        if (query.includes('FROM public_sale_links') && query.includes('partner_id =')) {
          return [mockPartnerSaleLinkRow];
        }
        if (query.includes('FROM partners') && query.includes('WHERE id =')) {
          return [{ id: mockPartnerRow.id, metadata: mockPartnerRow.metadata }];
        }
        return [];
      });

      const req = new NextRequest('https://duolife.com.br/api/public/referral?code=ALMEIDA10');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.referral.code).toBe('ALMEIDA10');
      expect(data.referral.partnerName).toBe('Almeida Benefícios');
      expect(data.referral.token).toBe('dlk_almeida_active_token');
      expect(data.referral.discountPercent).toBe(10);

      const cookieObj = res.cookies.get('duolife_ref');
      expect(cookieObj?.value).toBe('ALMEIDA10');
    });

    it('deve retornar 404 se o código ou ref não for fornecido', async () => {
      const req = new NextRequest('https://duolife.com.br/api/public/referral');
      const res = await GET(req);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('Código de indicação não');
    });

    it('deve retornar 404 se o código for inválido ou não encontrado', async () => {
      (sql as any).mockResolvedValue([]);

      const req = new NextRequest('https://duolife.com.br/api/public/referral?ref=NAO_EXISTE');
      const res = await GET(req);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('não encontrado');
    });

    it('deve retornar 404 se o parceiro for suspenso ou inativo', async () => {
      const suspendedLinkRow = {
        ...mockPublicLinkRow,
        status: 'active',
        partner_id: 'partner_suspended',
      };
      // Quando buscar parceiro na query, o status do parceiro é 'suspended'
      const suspendedPartnerRow = {
        ...mockPublicLinkRow,
        status: 'suspended',
      };

      (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
        const query = strings.join('?');
        if (query.includes('FROM public_sale_links pl')) {
          return [suspendedPartnerRow];
        }
        return [];
      });

      const req = new NextRequest('https://duolife.com.br/api/public/referral?ref=dlk_suspended');
      const res = await GET(req);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('inativo');
    });

    it('deve retornar 500 se ocorrer exceção inesperada', async () => {
      (sql as any).mockRejectedValue(new Error('Erro de conexão ao banco'));

      const req = new NextRequest('https://duolife.com.br/api/public/referral?ref=erro_db');
      const res = await GET(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toBe('Erro interno ao resolver indicação');
    });
  });
});
