'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useActiveReferral } from '@/lib/referral-whatsapp';

export default function FloatingWhatsApp() {
  const { whatsappUrl, partnerName } = useActiveReferral();

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={partnerName ? `Falar no WhatsApp com ${partnerName}` : 'Falar no WhatsApp'}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:scale-110 md:bottom-6 md:right-6 md:h-14 md:w-14"
    >
      <MessageCircle className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2} />
    </a>
  );
}
