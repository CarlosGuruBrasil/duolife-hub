'use client';

import { useState } from 'react';
import { Copy, Check, ExternalLink, Share2, Sparkles } from 'lucide-react';

interface PartnerSaleLinkCardProps {
  directUrl: string;
  refUrl: string;
  partnerCode: string;
}

export default function PartnerSaleLinkCard({ directUrl, refUrl, partnerCode }: PartnerSaleLinkCardProps) {
  const [copiedDirect, setCopiedDirect] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  async function copyText(text: string, isDirect: boolean) {
    try {
      await navigator.clipboard.writeText(text);
      if (isDirect) {
        setCopiedDirect(true);
        setTimeout(() => setCopiedDirect(false), 2500);
      } else {
        setCopiedRef(true);
        setTimeout(() => setCopiedRef(false), 2500);
      }
    } catch {}
  }

  return (
    <div className="card bg-gradient-to-br from-white via-gray-50 to-emerald-50/20 border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0e4a5a] text-white flex items-center justify-center shadow-xs">
            <Share2 size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>Seu Link de Vendas Online</span>
              <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                <Sparkles size={11} /> White-Label Ativo
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Envie para seus clientes para cotação e contratação com a identidade da sua corretora.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-gray-500 font-medium">Seu código:</span>
          <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 font-mono text-xs font-bold border border-gray-200">
            {partnerCode}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 pt-4">
        {/* Link 1: Contratação Direta */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a]">
              Link Direto de Contratação
            </span>
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#0e4a5a] hover:underline inline-flex items-center gap-1 font-medium"
            >
              Abrir <ExternalLink size={12} />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={directUrl}
              className="form-input text-xs font-mono bg-gray-50 text-gray-700 py-1.5 px-3 select-all flex-1"
            />
            <button
              type="button"
              onClick={() => copyText(directUrl, true)}
              className="btn btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedDirect ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              {copiedDirect ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* Link 2: Indicação Institucional */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Link com Código (?ref)
            </span>
            <a
              href={refUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-800 hover:underline inline-flex items-center gap-1 font-medium"
            >
              Abrir <ExternalLink size={12} />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={refUrl}
              className="form-input text-xs font-mono bg-gray-50 text-gray-700 py-1.5 px-3 select-all flex-1"
            />
            <button
              type="button"
              onClick={() => copyText(refUrl, false)}
              className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedRef ? <Check size={14} className="text-emerald-700" /> : <Copy size={14} />}
              {copiedRef ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
