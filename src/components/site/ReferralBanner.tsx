'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Sparkles, X, Building, Tag } from 'lucide-react';

interface ReferralInfo {
  code: string;
  partnerName: string;
  companyName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  directUrl: string;
  discountPercent?: number;
  token: string;
}

export default function ReferralBanner() {
  const searchParams = useSearchParams();
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Verifica se já foi dispensado nesta sessão
    if (typeof window !== 'undefined' && sessionStorage.getItem('duolife_ref_banner_dismissed') === 'true') {
      setDismissed(true);
      setLoading(false);
      return;
    }

    // 2. Extrai parâmetro ?ref= ou ?code= da URL
    const paramRef = searchParams.get('ref') || searchParams.get('code');

    // 3. Extrai cookie do navegador caso não esteja na URL
    let effectiveRef = paramRef;
    if (!effectiveRef && typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)duolife_ref=([^;]+)/);
      if (match) {
        effectiveRef = decodeURIComponent(match[1]);
      }
    }

    if (!effectiveRef) {
      setLoading(false);
      return;
    }

    // 4. Consulta a API pública de referral
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/referral?ref=${encodeURIComponent(effectiveRef)}`);
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }

        const data = await res.json();
        if (data.ok && data.referral && isMounted) {
          setReferral(data.referral);
          // Garante persistência no cookie do cliente por 30 dias
          document.cookie = `duolife_ref=${encodeURIComponent(effectiveRef)}; path=/; max-age=2592000; SameSite=Lax`;
        }
      } catch {
        // Silencioso se der erro de rede
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('duolife_ref_banner_dismissed', 'true');
    }
  };

  if (loading || dismissed || !referral) {
    return null;
  }

  const displayName = referral.companyName || referral.partnerName;
  const hasDiscount = Boolean(referral.discountPercent && referral.discountPercent > 0);

  return (
    <aside
      role="complementary"
      aria-label="Informações de Consultoria do Parceiro"
      className="fixed bottom-6 right-6 z-50 max-w-sm sm:max-w-md w-[calc(100%-3rem)] bg-white/95 backdrop-blur-md border border-emerald-200/90 rounded-2xl shadow-2xl p-4 transition-all duration-300 ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Identificação Visual do Consultor */}
        <div className="flex items-center gap-2.5 min-w-0">
          {referral.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={referral.logoUrl}
              alt={displayName}
              className="w-10 h-10 object-contain rounded-xl border border-gray-100 p-1 bg-white shrink-0 shadow-2xs"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Building size={18} />
            </div>
          )}

          <div className="min-w-0">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={11} className="text-emerald-600" />
              Consultoria Especializada
            </span>
            <h4 className="text-sm font-bold text-gray-900 truncate">
              {displayName}
            </h4>
          </div>
        </div>

        {/* Botão Fechar */}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Dispensar aviso de consultoria"
        >
          <X size={16} />
        </button>
      </div>

      {/* Condição de Desconto / Mensagem */}
      <div className="mt-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {hasDiscount ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
              <Tag size={11} /> -{referral.discountPercent}% OFF Aplicado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-md">
              Link Oficial Verificado
            </span>
          )}
          <span className="text-xs text-gray-600">
            Você está conectado às condições exclusivas deste consultor.
          </span>
        </div>

        {/* CTA para o link direto de contratação */}
        <div className="pt-1">
          <Link
            href={`/contratar/${referral.token}`}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#0e4a5a] hover:bg-[#072a33] text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg hover:scale-[1.01]"
          >
            <span>{hasDiscount ? 'Contratar Online com Desconto' : 'Iniciar Contratação Online'}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
