'use client';

import React from 'react';
import { Phone } from 'lucide-react';
import { useActiveReferral } from '@/lib/referral-whatsapp';

export default function HeroWhatsAppButton() {
  const { whatsappUrl } = useActiveReferral();

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 bg-transparent border border-white/20 hover:border-white hover:bg-white/5 text-white px-10 py-5 rounded-full font-bold text-sm transition-all duration-300"
    >
      <Phone size={15} />
      <span>Falar no WhatsApp</span>
    </a>
  );
}
