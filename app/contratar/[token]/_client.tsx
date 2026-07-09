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
    <div style={{ ['--primary' as string]: primary, ['--accent' as string]: accent }} className="min-h-screen bg-[#f5f7f7]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 rounded-3xl bg-white p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            {wl.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={wl.logoUrl} alt={wl.companyName || link.partner.razaoSocial} className="h-14 w-auto object-contain" />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-[var(--primary)]" />
            )}
            <div>
              <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>
                {wl.publicTitle || wl.companyName || link.partner.razaoSocial}
              </h1>
              <p className="text-sm text-gray-600">{wl.publicDescription || wl.companySlogan || link.partner.whiteLabel.companySlogan}</p>
            </div>
          </div>
        </div>

        {/* Formulário de Cotação Dinâmico */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <CotacaoFormRC publicToken={token} />
        </div>
      </div>
    </div>
  );
}
