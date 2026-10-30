// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModalResolverDuplicidade from '@/components/portal/ModalResolverDuplicidade';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/ui/toast/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

describe('ModalResolverDuplicidade UI', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockConflict = {
    hasConflict: true,
    resolved: false,
    originalClientId: 'client-01',
    originalData: {
      fullName: 'Doutor Silva Original',
      email: 'original@silva.med.br',
      phone: '11988887777',
      birthDate: '1980-01-01',
    },
    submittedData: {
      fullName: 'Dr. Silva Atualizado',
      email: 'novo@silva.med.br',
      phone: '11999990000',
      birthDate: '1980-01-01',
    },
    divergentFields: ['nome', 'email', 'celular'],
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deve renderizar os dados originais vs novos lado a lado destacando divergências', async () => {
    await act(async () => {
      root.render(
        <ModalResolverDuplicidade
          isOpen={true}
          onClose={vi.fn()}
          cotacaoId="cot-123"
          conflict={mockConflict}
          documentNumber="123.456.789-01"
        />
      );
    });

    expect(container.textContent).toContain('Resolução Obrigatória de Duplicidade Cadastral');
    expect(container.textContent).toContain('123.456.789-01');
    expect(container.textContent).toContain('Doutor Silva Original');
    expect(container.textContent).toContain('Dr. Silva Atualizado');
    expect(container.textContent).toContain('original@silva.med.br');
    expect(container.textContent).toContain('novo@silva.med.br');
  });

  it('deve disparar fetch com MANTER_ORIGINAL ao clicar no botão 1', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, resolution: 'MANTER_ORIGINAL' }),
    } as any);

    const onCloseMock = vi.fn();

    await act(async () => {
      root.render(
        <ModalResolverDuplicidade
          isOpen={true}
          onClose={onCloseMock}
          cotacaoId="cot-123"
          conflict={mockConflict}
          documentNumber="123.456.789-01"
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const btnManter = buttons.find((b) => b.textContent?.includes('Manter Cadastro Original'));
    expect(btnManter).toBeDefined();

    await act(async () => {
      btnManter?.click();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/portal/cotacoes/cot-123/resolver-duplicidade',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ choice: 'MANTER_ORIGINAL' }),
      })
    );
    expect(onCloseMock).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('deve disparar fetch com USAR_NOVOS ao clicar no botão 2', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, resolution: 'USAR_NOVOS' }),
    } as any);

    const onCloseMock = vi.fn();

    await act(async () => {
      root.render(
        <ModalResolverDuplicidade
          isOpen={true}
          onClose={onCloseMock}
          cotacaoId="cot-123"
          conflict={mockConflict}
          documentNumber="123.456.789-01"
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const btnNovos = buttons.find((b) => b.textContent?.includes('Atualizar Base com Novos Dados'));
    expect(btnNovos).toBeDefined();

    await act(async () => {
      btnNovos?.click();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/portal/cotacoes/cot-123/resolver-duplicidade',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ choice: 'USAR_NOVOS' }),
      })
    );
    expect(onCloseMock).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });
});
