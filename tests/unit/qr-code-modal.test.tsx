// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QrCodeModal from '@/components/portal/QrCodeModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/ui/toast/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/hooks/useBodyScrollLock', () => ({
  useBodyScrollLock: vi.fn(),
}));

describe('QrCodeModal Component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Mock URL.createObjectURL
    if (typeof window.URL.createObjectURL === 'undefined') {
      window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('não renderiza nada quando isOpen for false', async () => {
    await act(async () => {
      root.render(
        <QrCodeModal
          isOpen={false}
          onClose={vi.fn()}
          url="https://duolife.com.br/contratar/dlk_123"
        />
      );
    });

    expect(container.innerHTML).toBe('');
  });

  it('renderiza o modal com cabeçalho, abas e preview quando isOpen for true', async () => {
    await act(async () => {
      root.render(
        <QrCodeModal
          isOpen={true}
          onClose={vi.fn()}
          url="https://duolife.com.br/contratar/dlk_123"
          title="QR Code de Divulgação"
          companyName="Corretora Alpha"
          primaryColor="#0e4a5a"
          label="RC Profissional"
          discountPercent={10}
        />
      );
    });

    // Aguarda resolução das promessas assíncronas do QR Code
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.textContent).toContain('QR Code de Divulgação');
    expect(container.textContent).toContain('QR Code Direto');
    expect(container.textContent).toContain('Cartão de Balcão (Display)');
    expect(container.textContent).toContain('https://duolife.com.br/contratar/dlk_123');
    expect(container.textContent).toContain('Copiar Imagem');
    expect(container.textContent).toContain('SVG Vetorial');
    expect(container.textContent).toContain('Baixar PNG (Alta Res.)');
  });

  it('permite alternar entre abas Direct e Card', async () => {
    await act(async () => {
      root.render(
        <QrCodeModal
          isOpen={true}
          onClose={vi.fn()}
          url="https://duolife.com.br/contratar/dlk_123"
          companyName="Corretora Beta"
        />
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Encontra o botão da aba Cartão
    const cardTabButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cartão de Balcão')
    );
    expect(cardTabButton).toBeTruthy();

    await act(async () => {
      cardTabButton?.click();
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(container.textContent).toContain('Plaquinha completa com a marca');
  });

  it('chama onClose ao clicar no botão fechar ou pressionar Escape', async () => {
    const handleClose = vi.fn();

    await act(async () => {
      root.render(
        <QrCodeModal
          isOpen={true}
          onClose={handleClose}
          url="https://duolife.com.br/contratar/dlk_123"
        />
      );
    });

    const closeBtn = container.querySelector('button[aria-label="Fechar modal de QR Code"]') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      closeBtn.click();
    });

    expect(handleClose).toHaveBeenCalledTimes(1);

    // Teste Escape
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
