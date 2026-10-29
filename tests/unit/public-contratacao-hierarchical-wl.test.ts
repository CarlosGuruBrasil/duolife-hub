import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/contrato-link-resolver', () => ({
  resolveContratoSignUrl: vi.fn().mockResolvedValue(null),
}));

import { sql } from '@/lib/pg';
import { GET } from '../../app/api/public/contratacao/[token]/route';

describe('Public Contratação Hierarchical White-Label & Discount (/api/public/contratacao/[token])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve herdar logotipo e cores da Corretora Mãe quando o parceiro não possui customização própria', async () => {
    let capturedQuery = '';
    const mockSql = sql as any;
    mockSql.mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const q = strings.join('?');
      if (q.includes('FROM public_sale_links')) {
        capturedQuery = q;
        return [
          {
            id: 'link-wl-01',
            token: 'dlk_heranca_001',
            partner_id: 'partner-heranca-01',
            product_id: 'prod-rc-001',
            flow_type: 'external',
            label: 'Campanha Herança WL',
            status: 'active',
            expires_at: null,
            used_at: null,
            metadata: {},
            created_at: new Date().toISOString(),
            discount_percent: 15,
            razao_social: 'Parceiro Sem Logo LTDA',
            nome_fantasia: 'Parceiro Sem Logo',
            email: 'contato@parceiro.com.br',
            phone: '11988887777',
            partner_metadata: {
              whiteLabel: {
                companyName: 'Parceiro Sem Logo',
                // Sem logoUrl nem cores próprias
              },
            },
            corretora_metadata: {
              whiteLabel: {
                slug: 'corretora-mae',
                companyName: 'Corretora Mãe Seguros',
                companySlogan: 'Sua corretora de confiança',
                logoUrl: 'https://cdn.duolife.com.br/corretoras/mae-logo.svg',
                primaryColor: '#004172',
                secondaryColor: '#00a0af',
                accentColor: '#00689b',
                susep: '202018702',
              },
            },
            product_name: 'RC Profissional Médico',
            product_code: 'RC-MED-001',
          },
        ];
      }
      return [];
    });

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_heranca_001');
    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_heranca_001' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(capturedQuery).toContain('corretoras');
    expect(capturedQuery).toContain('corretora_metadata');

    // Validação da herança de White-Label
    const wl = data.link.partner.whiteLabel;
    expect(wl).toBeDefined();
    expect(wl.logoUrl).toBe('https://cdn.duolife.com.br/corretoras/mae-logo.svg');
    expect(wl.primaryColor).toBe('#004172');
    expect(wl.secondaryColor).toBe('#00a0af');
    expect(wl.accentColor).toBe('#00689b');
    expect(wl.companySlogan).toBe('Sua corretora de confiança');
    expect(wl.susep).toBe('202018702');

    // Validação do percentual de desconto
    expect(data.link.discountPercent).toBe(15);
  });

  it('deve preservar logotipo e cores customizadas do parceiro quando presentes', async () => {
    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([
      {
        id: 'link-wl-02',
        token: 'dlk_custom_002',
        partner_id: 'partner-custom-02',
        product_id: 'prod-rc-001',
        flow_type: 'external',
        label: 'Campanha Parceiro Custom',
        status: 'active',
        expires_at: null,
        used_at: null,
        metadata: {},
        created_at: new Date().toISOString(),
        discount_percent: 10,
        razao_social: 'Consultoria Personalizada LTDA',
        nome_fantasia: 'Consultoria Personalizada',
        email: 'contato@personalizada.com.br',
        phone: '11977776666',
        partner_metadata: {
          whiteLabel: {
            companyName: 'Consultoria Personalizada',
            logoUrl: 'https://cdn.custom.com/logo-personalizado.png',
            primaryColor: '#123456',
            secondaryColor: '#345678',
            accentColor: '#567890',
          },
        },
        corretora_metadata: {
          whiteLabel: {
            slug: 'corretora-mae',
            companyName: 'Corretora Mãe Seguros',
            logoUrl: 'https://cdn.duolife.com.br/corretoras/mae-logo.svg',
            primaryColor: '#004172',
            susep: '202018702',
          },
        },
        product_name: 'RC Profissional',
        product_code: 'RC-001',
      },
    ]);

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_custom_002');
    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_custom_002' }) });
    const data = await res.json();

    expect(res.status).toBe(200);

    // Validação de preservação do White-Label do parceiro
    const wl = data.link.partner.whiteLabel;
    expect(wl.logoUrl).toBe('https://cdn.custom.com/logo-personalizado.png');
    expect(wl.primaryColor).toBe('#123456');
    expect(wl.secondaryColor).toBe('#345678');
    expect(wl.accentColor).toBe('#567890');
    expect(wl.companyName).toBe('Consultoria Personalizada');
    // Herdando o SUSEP da mãe já que o parceiro não possui susep próprio
    expect(wl.susep).toBe('202018702');

    // Validação do desconto comercial
    expect(data.link.discountPercent).toBe(10);
  });

  it('deve retornar discountPercent = 0 quando não houver desconto cadastrado e lidar com ausência de corretora_metadata', async () => {
    const mockSql = sql as any;
    mockSql.mockResolvedValueOnce([
      {
        id: 'link-wl-03',
        token: 'dlk_sem_desconto_003',
        partner_id: 'partner-sem-mae-03',
        product_id: 'prod-rc-001',
        flow_type: 'external',
        label: 'Link Padrão',
        status: 'active',
        expires_at: null,
        used_at: null,
        metadata: {},
        created_at: new Date().toISOString(),
        discount_percent: 0,
        razao_social: 'Parceiro Independente',
        nome_fantasia: null,
        email: 'independente@teste.com',
        phone: null,
        partner_metadata: {},
        corretora_metadata: null,
        product_name: 'RC Profissional',
        product_code: 'RC-001',
      },
    ]);

    const req = new NextRequest('http://localhost/api/public/contratacao/dlk_sem_desconto_003');
    const res = await GET(req, { params: Promise.resolve({ token: 'dlk_sem_desconto_003' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.link.discountPercent).toBe(0);
    expect(data.link.partner.whiteLabel).toBeDefined();
    expect(data.link.partner.whiteLabel.primaryColor).toBe('#0e4a5a'); // Padrão DuoLife
  });
});
