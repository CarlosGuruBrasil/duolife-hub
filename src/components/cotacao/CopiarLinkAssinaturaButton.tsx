'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopiarLinkAssinaturaButtonProps {
  signUrl: string;
  tone?: 'amber' | 'purple';
}

export function CopiarLinkAssinaturaButton({ signUrl, tone = 'amber' }: CopiarLinkAssinaturaButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(signUrl);
    } catch {
      // Fallback para navegadores sem Clipboard API (ou contexto não seguro)
      const el = document.createElement('textarea');
      el.value = signUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const toneClass =
    tone === 'purple'
      ? 'bg-purple-700 hover:bg-purple-800'
      : 'bg-amber-600 hover:bg-amber-700';

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 ${toneClass} text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-xs shrink-0 min-h-[44px] md:min-h-0`}
      title="Copiar link de assinatura para enviar ao cliente"
    >
      {copied ? <Check size={14} className="shrink-0" /> : <Copy size={14} className="shrink-0" />}
      <span>{copied ? 'Link copiado!' : 'Copiar Link de Assinatura'}</span>
    </button>
  );
}
