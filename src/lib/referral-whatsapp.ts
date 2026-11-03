'use client';

import { useState, useEffect } from 'react';

export const DUOLIFE_WHATSAPP_NUMBER = '5547996486081';
export const DUOLIFE_DEFAULT_WHATSAPP_TEXT = 'Olá! Gostaria de falar com o time comercial da DuoLife.';

export function getWhatsAppText(partnerName?: string | null): string {
  if (partnerName && partnerName.trim()) {
    return `Olá! Gostaria de falar com o time comercial sobre as condições da ${partnerName.trim()}.`;
  }
  return DUOLIFE_DEFAULT_WHATSAPP_TEXT;
}

export function getWhatsAppUrl(partnerName?: string | null): string {
  const text = getWhatsAppText(partnerName);
  return `https://wa.me/${DUOLIFE_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export interface ActiveReferralDetail {
  partnerName: string;
  token?: string;
  expiresAt?: string;
}

export function useActiveReferral() {
  const [partnerName, setPartnerName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Verifica se o cookie duolife_ref ainda está presente no navegador
    const hasRefCookie = /(?:^|;\s*)duolife_ref=([^;]+)/.test(document.cookie);

    if (!hasRefCookie) {
      // Cookie não existe ou já expirou pelo Max-Age: limpa qualquer resquício
      try {
        sessionStorage.removeItem('duolife_active_referral');
      } catch {}
      setPartnerName(null);
    } else {
      // Cookie presente: tenta restaurar dados de sessão salvos
      try {
        const cachedRaw = sessionStorage.getItem('duolife_active_referral');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.partnerName) {
            // Se tiver expiresAt e já passou da data, ignora
            if (cached.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) {
              sessionStorage.removeItem('duolife_active_referral');
              setPartnerName(null);
            } else {
              setPartnerName(cached.partnerName);
            }
          }
        }
      } catch {}
    }

    // 2. Escuta eventos customizados disparados por ReferralBanner ou outros componentes
    const handleReferral = (event: Event) => {
      const customEvent = event as CustomEvent<ActiveReferralDetail | null>;
      const detail = customEvent.detail;
      if (detail && detail.partnerName) {
        setPartnerName(detail.partnerName);
        try {
          sessionStorage.setItem('duolife_active_referral', JSON.stringify(detail));
        } catch {}
      } else {
        setPartnerName(null);
        try {
          sessionStorage.removeItem('duolife_active_referral');
        } catch {}
      }
    };

    window.addEventListener('duolife:referral', handleReferral);
    return () => {
      window.removeEventListener('duolife:referral', handleReferral);
    };
  }, []);

  return {
    partnerName,
    whatsappUrl: getWhatsAppUrl(partnerName),
    whatsappText: getWhatsAppText(partnerName),
    hasActiveReferral: Boolean(partnerName),
  };
}
