// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PartnerProfileForm from '@/components/portal/PartnerProfileForm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe('Portal Branding UI - Aba Identidade White Label', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockPartner = {
    id: 'partner-100',
    razao_social: 'Corretora Modelo LTDA',
    nome_fantasia: 'Corretora Modelo',
    cnpj: '12.345.678/0001-90',
    cpf: null,
    person_type: 'pj' as const,
    email: 'contato@corretoramodelo.com.br',
    phone: '11999998888',
    address: {
      city: 'Florianópolis',
      state: 'SC',
      street: 'Av. Beira Mar Norte, 500',
    },
    status: 'active',
  };

  const mockWhiteLabel = {
    slug: 'corretora-modelo',
    companyName: 'Corretora Modelo',
    companySlogan: 'Segurança e Confiança para sua Empresa',
    companyPhone: '11999998888',
    companyEmail: 'contato@corretoramodelo.com.br',
    companyWebsite: 'https://corretoramodelo.com.br',
    logoUrl: 'https://exemplo.com/logo-antigo.png',
    primaryColor: '#0e4a5a',
    secondaryColor: '#7fa8b2',
    accentColor: '#00d4e0',
    publicTitle: 'Contratação de Seguro RC Profissional',
    publicDescription: 'Seja bem-vindo ao portal de contratação da Corretora Modelo.',
    wixCode: 'MODELO',
    domain: '',
    subdomain: '',
    institutionText: '',
    footerText: '',
    links: [],
    availableProductIds: [],
    customTexts: {},
  };

  const mockSaleLink = {
    id: 'link-01',
    token: 'dlk_modelo',
    url: 'https://duolife.com.br/contratar/dlk_modelo',
    directUrl: 'https://duolife.com.br/contratar/dlk_modelo',
    refUrl: 'https://duolife.com.br/?ref=MODELO',
    code: 'MODELO',
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, links: [] }),
    }) as any;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve alternar para a aba Identidade White Label e renderizar seletores de cores, paletas de 1-clique, upload e preview', async () => {
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

    // Clica no botão da aba Identidade White Label
    const tabButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Identidade White Label')
    );
    expect(tabButtons.length).toBeGreaterThan(0);

    await act(async () => {
      tabButtons[0].click();
    });

    const html = container.innerHTML;

    // 1. Seletores de Cores (Primária, Secundária e Destaque)
    expect(html).toContain('Cor Primária');
    expect(html).toContain('Cor Secundária');
    expect(html).toContain('Cor de Destaque');

    // 2. Paletas Rápidas Corporativas
    expect(html).toContain('DuoLife Clássico');
    expect(html).toContain('Esmeralda Prestige');
    expect(html).toContain('Azul Royal');

    // 3. Upload e Gestão de Logotipo
    expect(html).toContain('Logotipo da Corretora');
    expect(html).toContain('Remover Logotipo');
    expect(html).toContain('Substituir Imagem');

    // 4. Simulador em Tempo Real (Live Preview)
    expect(html).toContain('Prévia ao Vivo da Página de Contratação');
    expect(html).toContain('Segurança e Confiança para sua Empresa');
    expect(html).toContain('Contratar Agora');
  });

  it('deve aplicar uma paleta corporativa de 1-clique e atualizar os valores de cor', async () => {
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

    // Navega para a aba whitelabel
    const tabButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Identidade White Label')
    );
    await act(async () => {
      tabButton?.click();
    });

    // Clica no botão do preset Esmeralda Prestige
    const esmeraldaButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Esmeralda Prestige')
    );
    expect(esmeraldaButton).toBeDefined();

    await act(async () => {
      esmeraldaButton?.click();
    });

    // Verifica se os inputs de cor refletem o novo valor da paleta Esmeralda (#064e3b)
    const primaryInput = container.querySelector('input[value="#064e3b"]') as HTMLInputElement;
    expect(primaryInput).not.toBeNull();
  });

  it('deve permitir remover o logotipo atual e exibir o estado vazio com "Escolher Logotipo"', async () => {
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

    const tabButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Identidade White Label')
    );
    await act(async () => {
      tabButton?.click();
    });

    // Clica no botão "Remover Logotipo"
    const removeButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Remover Logotipo')
    );
    expect(removeButton).toBeDefined();

    await act(async () => {
      removeButton?.click();
    });

    const html = container.innerHTML;
    expect(html).toContain('Escolher Logotipo');
    expect(html).toContain('Nenhum logotipo selecionado');
  });
});
