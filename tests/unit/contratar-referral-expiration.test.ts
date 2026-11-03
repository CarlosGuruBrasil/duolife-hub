import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

let mockCookieStore = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(async () => ({
    get: (key: string) => {
      const val = mockCookieStore.get(key);
      return val ? { name: key, value: val } : undefined;
    },
  })),
}));

vi.mock('@/lib/referral', () => ({
  resolvePartnerOrLink: vi.fn(),
}));

import ContratarIndexPage from '@/../app/contratar/page';
import { resolvePartnerOrLink } from '@/lib/referral';

describe('app/contratar/page.tsx - Resolução de Redirecionamento e Expiração de Token de Indicação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.clear();
  });

  it('deve redirecionar para a URL do token quando houver indicação válida via parâmetro ?ref=', async () => {
    vi.mocked(resolvePartnerOrLink).mockResolvedValue({
      token: 'dlk_token_valido_123',
    } as any);

    await ContratarIndexPage({
      searchParams: Promise.resolve({ ref: 'NET4LIFE' }),
    });

    expect(resolvePartnerOrLink).toHaveBeenCalledWith('NET4LIFE');
    expect(mockRedirect).toHaveBeenCalledWith('/contratar/dlk_token_valido_123');
  });

  it('deve redirecionar para a URL do token quando houver cookie duolife_ref ativo', async () => {
    mockCookieStore.set('duolife_ref', 'NET4LIFE');

    vi.mocked(resolvePartnerOrLink).mockResolvedValue({
      token: 'dlk_net4life_active',
    } as any);

    await ContratarIndexPage({
      searchParams: Promise.resolve({}),
    });

    expect(resolvePartnerOrLink).toHaveBeenCalledWith('NET4LIFE');
    expect(mockRedirect).toHaveBeenCalledWith('/contratar/dlk_net4life_active');
  });

  it('deve renderizar fallback limpo (sem redirecionar) quando o cookie estiver ausente ou expirado', async () => {
    // Cookie duolife_ref ausente (expirou pelo Max-Age do navegador)
    const result = await ContratarIndexPage({
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.type).toBe('div');
  });

  it('deve renderizar fallback limpo se o cookie apontar para um código que já foi inativado ou não existe', async () => {
    mockCookieStore.set('duolife_ref', 'CODIGO_INEXISTENTE');
    vi.mocked(resolvePartnerOrLink).mockResolvedValue(null);

    const result = await ContratarIndexPage({
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
