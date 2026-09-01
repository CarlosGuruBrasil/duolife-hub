'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ReferralTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;

    const trimmed = ref.trim();
    if (!trimmed) return;

    // Persiste no cookie por 30 dias (2.592.000 segundos)
    document.cookie = `duolife_ref=${encodeURIComponent(trimmed)}; path=/; max-age=2592000; SameSite=Lax`;

    try {
      sessionStorage.setItem('duolife_ref', trimmed);
    } catch {}
  }, [searchParams]);

  return null;
}
