// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PartnerProfileForm from '@/components/portal/PartnerProfileForm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/portal/GerarLinkClienteButton', () => ({
  default: () => <button>Novo Link</button>,
}));

describe('PartnerProfileForm - Métricas de Conversão de Links', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const mockPartner = {
    id: 'partner-123',
    razao_social: 'CORRETORA EXEMPLO LTDA',
    nome_fantasia: 'Corretora Exemplo',
    email: 'contato@exemplo.com.br',
    phone: '11999998888',
    address: null,
  };

  const mockWhiteLabel = {
    slug: 'exemplo',
    companyName: 'Corretora Exemplo',
    companySlogan: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    logoUrl: '',
    primaryColor: '#0e4a5a',
    secondaryColor: '#7fa8b2',
    accentColor: '#00d4e0',
    domain: '',
    subdomain: '',
    institutionText: '',
    footerText: '',
    publicTitle: '',
    publicDescription: '',
    wixCode: 'EXEMPLO',
    links: [],
    availableProductIds: [],
    customTexts: {},
  };

  const mockSaleLink = {
    token: 'dlk_padrao_123',
    url: 'https://duolife.com.br/contratar/dlk_padrao_123',
    directUrl: 'https://duolife.com.br/contratar/dlk_padrao_123',
    refUrl: 'https://duolife.com.br/?ref=EXEMPLO',
    code: 'EXEMPLO',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve renderizar a régua de métricas com cliques, únicos, cotações, vendas e taxa de conversão', async () => {
    const fakeLinks = [
      {
        id: 'link-01',
        token: 'dlk_campanha_face',
        label: 'Campanha Facebook Ads',
        flow_type: 'external',
        status: 'active',
        discount_percent: 15,
        views_count: 200,
        unique_views_count: 140,
        total_cotacoes: 30,
        total_vendas: 6,
        conversion_rate_cotacao: 15.0,
        conversion_rate_venda: 3.0,
        fechamento_rate: 20.0,
        url: 'https://duolife.com.br/contratar/dlk_campanha_face',
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, links: fakeLinks }),
    }) as any;

    await act(async () => {
      root.render(
        <PartnerProfileForm
          partner={mockPartner}
          whiteLabel={mockWhiteLabel}
          saleLink={mockSaleLink}
          canEdit={true}
        />
      );
    });

    // Permite resolução de promessas
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const text = container.textContent || '';
    expect(text).toContain('Campanha Facebook Ads');
    expect(text).toContain('200'); // Cliques
    expect(text).toContain('140'); // Únicos
    expect(text).toContain('30');  // Cotações
    expect(text).toContain('6');   // Vendas
    expect(text).toContain('3% conv.'); // Conversão Venda
  });
});
