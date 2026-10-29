// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ReferralBanner from '@/components/site/ReferralBanner';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock do next/navigation
const mockSearchParams = new Map<string, string>();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
}));

// Mock do next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ReferralBanner Component', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
    sessionStorage.clear();
    // Limpa cookies
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });

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

  it('não deve renderizar nada quando não houver parâmetro nem cookie', async () => {
    await act(async () => {
      root.render(<ReferralBanner />);
    });

    expect(container.innerHTML).toBe('');
  });

  it('não deve renderizar quando estiver marcado como dispensado no sessionStorage', async () => {
    sessionStorage.setItem('duolife_ref_banner_dismissed', 'true');
    mockSearchParams.set('ref', 'CORRETORA_TOP');

    await act(async () => {
      root.render(<ReferralBanner />);
    });

    expect(container.innerHTML).toBe('');
  });

  it('deve carregar dados da API e renderizar banner com informações do parceiro e desconto', async () => {
    mockSearchParams.set('ref', 'SILVA15');

    const fakeResponse = {
      ok: true,
      referral: {
        code: 'SILVA15',
        partnerName: 'Silva Corretora',
        companyName: 'Silva & Filhos Seguros',
        token: 'dlk_silva15_token',
        directUrl: '/contratar/dlk_silva15_token',
        discountPercent: 15,
        primaryColor: '#0e4a5a',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    }) as any;

    await act(async () => {
      root.render(<ReferralBanner />);
    });

    // Aguarda resolução da promise
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/public/referral?ref=SILVA15');
    expect(container.textContent).toContain('Silva & Filhos Seguros');
    expect(container.textContent).toContain('-15% OFF Aplicado');
    expect(container.innerHTML).toContain('href="/contratar/dlk_silva15_token"');
    expect(container.innerHTML).toContain('role="complementary"');
    expect(container.innerHTML).toContain('aria-label="Informações de Consultoria do Parceiro"');

    // Deve ter gravado o cookie de 30 dias
    expect(document.cookie).toContain('duolife_ref=SILVA15');
  });

  it('deve fechar o banner e persistir no sessionStorage ao clicar no botão dispensar', async () => {
    mockSearchParams.set('code', 'PARCEIRO10');

    const fakeResponse = {
      ok: true,
      referral: {
        code: 'PARCEIRO10',
        partnerName: 'Parceiro Dez',
        companyName: 'Parceiro Dez Consultoria',
        token: 'dlk_parceiro10',
        directUrl: '/contratar/dlk_parceiro10',
        discountPercent: 0,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    }) as any;

    await act(async () => {
      root.render(<ReferralBanner />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(container.textContent).toContain('Parceiro Dez Consultoria');

    const closeBtn = container.querySelector('button[aria-label="Dispensar aviso de consultoria"]');
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sessionStorage.getItem('duolife_ref_banner_dismissed')).toBe('true');
    expect(container.innerHTML).toBe('');
  });
});
