'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import CotacaoFormRC from '@/components/portal/CotacaoFormRC';
import { User, Building2 } from 'lucide-react';

interface PartnerOption {
  id: string;
  nome_fantasia: string;
  razao_social: string;
}

export default function AdminNovaCotacaoPage() {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPartners() {
      try {
        const res = await fetch('/api/admin/parceiros');
        const data = await res.json();
        if (data.parceiros) {
          // Sort to put DuoLife on top or just sort alphabetically
          setPartners(data.parceiros);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchPartners();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Carregando parceiros...</div>;
  }

  if (!selectedPartnerId) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="mb-6">
          <Link href="/admin/cotacoes" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
            ← Voltar para cotações
          </Link>
          <h1 className="text-2xl font-bold mt-3" style={{ color: 'var(--primary-dark)' }}>Iniciar Nova Cotação</h1>
          <p className="text-gray-500 mt-1">
            Como administrador, você pode iniciar uma cotação em nome de qualquer corretor parceiro, ou registrar como Venda Direta DuoLife.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Selecione o Parceiro</label>
          <div className="space-y-3">
            {partners.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPartnerId(p.id)}
                className="w-full text-left flex items-center gap-3 p-4 border rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition"
              >
                <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
                  {p.nome_fantasia === 'DuoLife' ? <Building2 size={20} /> : <User size={20} />}
                </div>
                <div>
                  <div className="font-semibold text-gray-800">{p.nome_fantasia || p.razao_social}</div>
                  <div className="text-xs text-gray-500">{p.nome_fantasia === 'DuoLife' ? 'Venda Direta' : 'Corretor Parceiro'}</div>
                </div>
              </button>
            ))}
            {partners.length === 0 && (
              <div className="text-sm text-red-500">Nenhum parceiro encontrado no sistema.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const selectedPartner = partners.find(p => p.id === selectedPartnerId);

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <button 
            onClick={() => setSelectedPartnerId(null)}
            className="text-sm font-medium mb-3 inline-block" 
            style={{ color: 'var(--primary)' }}
          >
            ← Trocar parceiro
          </button>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--primary-dark)' }}>Nova Proposta / Venda RC ADV</h1>
          <p className="text-gray-500 mt-1">
            Simulando como: <strong className="text-gray-800">{selectedPartner?.nome_fantasia || selectedPartner?.razao_social}</strong>
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow mb-8">
        <CotacaoFormRC adminSelectedPartnerId={selectedPartnerId} />
      </div>
    </div>
  );
}
