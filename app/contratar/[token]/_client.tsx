'use client';

import { useEffect, useState } from 'react';
import CotacaoFormRC from '@/components/portal/CotacaoFormRC';

type WhiteLabel = {
  companyName: string;
  companySlogan: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  publicTitle: string;
  publicDescription: string;
};

type ContractLink = {
  token: string;
  label: string | null;
  partner: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    email: string;
    phone: string | null;
    whiteLabel: WhiteLabel;
  };
  product: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
};

interface Props {
  token: string;
}

export default function ContractPageClient({ token }: Props) {
  const [link, setLink] = useState<ContractLink | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/public/contratacao/${token}`);
      const data = await res.json();
      setLink(data.link || null);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Carregando contratação...</div>;
  }

  if (!link) {
    return <div className="p-8 text-center text-red-600">Link inválido ou expirado.</div>;
  }

  const wl = link.partner.whiteLabel;
  const primary = wl.primaryColor || '#0e4a5a';
  const accent = wl.accentColor || '#00d4e0';

  return (
    <div style={{ ['--primary' as string]: primary, ['--accent' as string]: accent }} className="min-h-screen bg-[#f5f7f7] font-sans flex flex-col">
      {/* Header Premium (Hero) */}
      <header className="bg-[var(--primary)] text-white pt-10 pb-28 px-4 relative overflow-hidden">
        {/* Background Decorative Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          </svg>
        </div>
        
        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center text-center mt-4">
          {wl.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={wl.logoUrl} 
              alt={wl.companyName || link.partner.razaoSocial} 
              className="h-20 sm:h-24 w-auto object-contain bg-white/90 p-4 rounded-3xl backdrop-blur-sm border border-white/20 mb-8 shadow-xl transition-transform hover:scale-105" 
            />
          ) : (
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30 mb-8 shadow-xl">
              <span className="text-4xl font-bold">{wl.companyName?.[0] || link.partner.razaoSocial[0]}</span>
            </div>
          )}
          
          <h1 className="text-3xl md:text-5xl font-black mb-4 tracking-tight text-white drop-shadow-md">
            {wl.publicTitle || `Contrate seu Seguro RC com a ${wl.companyName || link.partner.razaoSocial}`}
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl font-light">
            {wl.publicDescription || wl.companySlogan || 'Proteção completa e especializada para a sua carreira. Cotação e contratação 100% digital, rápida e segura.'}
          </p>
        </div>
      </header>

      {/* Main Content Area (Form floats over the hero) */}
      <main className="flex-grow px-4 -mt-16 relative z-20 pb-20">
        <div className="max-w-4xl mx-auto">
          {/* Formulário de Cotação Dinâmico */}
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden ring-1 ring-black/5">
            {/* Trust Badges Strip above the form */}
            <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 font-medium">
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg> Ambiente Seguro
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg> Processo Imediato
              </span>
            </div>
            
            <div className="p-2 sm:p-6">
              <CotacaoFormRC publicToken={token} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Partner Contact Info */}
      <footer className="bg-white border-t border-gray-200 py-12 mt-auto">
        <div className="max-w-4xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-6">
          <div>
            <h3 className="font-bold text-gray-900 mb-2">{link.partner.razaoSocial}</h3>
            <p className="text-sm text-gray-500">
              {link.partner.email} {link.partner.phone && `• ${link.partner.phone}`}
            </p>
          </div>
          
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>Powered by</span>
            <span className="font-black text-gray-700 tracking-tight text-lg">DUOLIFE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
