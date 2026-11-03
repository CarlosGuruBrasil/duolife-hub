// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FloatingWhatsApp from '@/components/site/FloatingWhatsApp';
import HeroWhatsAppButton from '@/components/site/HeroWhatsAppButton';
import { getWhatsAppText, getWhatsAppUrl, DUOLIFE_WHATSAPP_NUMBER, DUOLIFE_DEFAULT_WHATSAPP_TEXT } from '@/lib/referral-whatsapp';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('FloatingWhatsApp & HeroWhatsAppButton Components', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // Limpa cookies no jsdom
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

  it('deve formatar texto e URL padrão DuoLife quando não houver parceiro ativo', () => {
    expect(getWhatsAppText(null)).toBe(DUOLIFE_DEFAULT_WHATSAPP_TEXT);
    expect(getWhatsAppText('')).toBe(DUOLIFE_DEFAULT_WHATSAPP_TEXT);
    const url = getWhatsAppUrl(null);
    expect(url).toBe(`https://wa.me/${DUOLIFE_WHATSAPP_NUMBER}?text=${encodeURIComponent(DUOLIFE_DEFAULT_WHATSAPP_TEXT)}`);
  });

  it('deve formatar texto com o nome da corretora quando houver parceiro ativo', () => {
    const text = getWhatsAppText('NET4Life Corretora de Seguros');
    expect(text).toBe('Olá! Gostaria de falar com o time comercial sobre as condições da NET4Life Corretora de Seguros.');
    const url = getWhatsAppUrl('NET4Life Corretora de Seguros');
    expect(url).toContain(encodeURIComponent('NET4Life Corretora de Seguros'));
  });

  it('FloatingWhatsApp deve renderizar link padrão DuoLife por padrão', async () => {
    await act(async () => {
      root.render(<FloatingWhatsApp />);
    });

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(getWhatsAppUrl(null));
    expect(link?.getAttribute('aria-label')).toBe('Falar no WhatsApp');
  });

  it('HeroWhatsAppButton deve renderizar link padrão DuoLife por padrão', async () => {
    await act(async () => {
      root.render(<HeroWhatsAppButton />);
    });

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(getWhatsAppUrl(null));
    expect(link?.textContent).toContain('Falar no WhatsApp');
  });

  it('deve reagir dinamicamente a evento duolife:referral atualizando o link com o nome da corretora', async () => {
    await act(async () => {
      root.render(<FloatingWhatsApp />);
    });

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe(getWhatsAppUrl(null));

    // Simula evento disparado por ReferralBanner ao resolver indicação ativa
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('duolife:referral', {
          detail: {
            partnerName: 'NET4Life Corretora de Seguros',
            token: 'dlk_net4life_123',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        })
      );
    });

    expect(link?.getAttribute('href')).toBe(getWhatsAppUrl('NET4Life Corretora de Seguros'));
    expect(link?.getAttribute('aria-label')).toBe('Falar no WhatsApp com NET4Life Corretora de Seguros');

    // Simula expiração ou limpeza
    await act(async () => {
      window.dispatchEvent(new CustomEvent('duolife:referral', { detail: null }));
    });

    expect(link?.getAttribute('href')).toBe(getWhatsAppUrl(null));
  });
});
