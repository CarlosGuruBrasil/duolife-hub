// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ReferralTracker from '@/components/public/ReferralTracker';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockSearchParams = new Map<string, string>();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) || null,
  }),
}));

describe('ReferralTracker Global Component', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.clear();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('deve sincronizar o parceiro e emitir evento duolife:referral ao detectar ?ref= em qualquer rota', async () => {
    mockSearchParams.set('ref', 'NET4LIFE');

    let eventFired = false;
    let eventDetail: any = null;

    window.addEventListener('duolife:referral', (e: any) => {
      eventFired = true;
      eventDetail = e.detail;
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        referral: {
          token: 'NET4LIFE',
          partnerName: 'Net4Life Corretora',
          companyName: 'Net4Life Corretora',
          ttlSeconds: 86400,
        },
      }),
    } as any);

    await act(async () => {
      root.render(<ReferralTracker />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(sessionStorage.getItem('duolife_ref')).toBe('NET4LIFE');
    const stored = JSON.parse(sessionStorage.getItem('duolife_active_referral') || '{}');
    expect(stored.partnerName).toBe('Net4Life Corretora');
    expect(eventFired).toBe(true);
    expect(eventDetail?.partnerName).toBe('Net4Life Corretora');
  });
});
