'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref') || searchParams.get('code');
    if (!ref) return;

    const trimmed = ref.trim();
    if (!trimmed) return;

    // Consulta a API pública de referral para emitir o cookie com o TTL dinâmico configurado
    fetch(`/api/public/referral?ref=${encodeURIComponent(trimmed)}`)
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data && data.ok && data.referral) {
          const ttl = data.referral.ttlSeconds || 86400;
          document.cookie = `duolife_ref=${encodeURIComponent(trimmed)}; path=/; max-age=${ttl}; SameSite=Lax`;
          try {
            sessionStorage.setItem('duolife_ref', trimmed);
          } catch {}
        }
      })
      .catch(() => {
        // Fallback resiliente com 24 horas (86400s)
        document.cookie = `duolife_ref=${encodeURIComponent(trimmed)}; path=/; max-age=86400; SameSite=Lax`;
      });
  }, [searchParams]);

  return null;
}
