'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FilePen, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { formatarDocumento } from '@/lib/format';

interface RascunhoItem {
  id: string;
  product_id: string | null;
  partner_name: string | null;
  step: number;
  client_name: string | null;
  client_cpf_cnpj: string | null;
  updated_at: string;
}

const STEP_LABELS: Record<number, string> = {
  1: 'Cobertura',
  2: 'Segurado',
  3: 'Perfil',
  4: 'Declarações',
  5: 'Pagamento',
};

interface Props {
  /** Rota da nova cotação, ex.: /portal/cotacoes/nova */
  basePath: string;
  /** Nome do parâmetro de produto aceito pela rota (portal: product, admin: productId). */
  productParam?: string;
  showPartner?: boolean;
}

export default function RascunhosEmAndamento({ basePath, productParam = 'product', showPartner = false }: Props) {
  const [items, setItems] = useState<RascunhoItem[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/rascunhos')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.rascunhos)) setItems(data.rascunhos);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const descartar = async (id: string) => {
    setRemoving(id);
    try {
      const res = await fetch(`/api/portal/rascunhos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        toast.info('Rascunho descartado.');
      } else {
        toast.error('Não foi possível descartar o rascunho.');
      }
    } catch {
      toast.error('Não foi possível descartar o rascunho.');
    } finally {
      setRemoving(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
      <header className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <FilePen size={16} className="text-gray-500" />
        <h2 className="text-sm font-bold text-gray-800">Rascunhos em andamento</h2>
        <span className="text-xs text-gray-500">({items.length}) · expiram em 30 dias sem alteração</span>
      </header>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => {
          const params = new URLSearchParams();
          if (item.product_id) params.set(productParam, item.product_id);
          params.set('rascunho', item.id);
          return (
            <li key={item.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {item.client_name || 'Proponente não informado'}
                  {item.client_cpf_cnpj && (
                    <span className="ml-2 text-xs font-normal text-gray-500">{formatarDocumento(item.client_cpf_cnpj)}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  Parou em: {STEP_LABELS[item.step] || `Etapa ${item.step}`} · atualizado em{' '}
                  {new Date(item.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {showPartner && item.partner_name ? ` · ${item.partner_name}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`${basePath}?${params.toString()}`} className="btn-primary text-xs py-1.5">
                  Continuar
                </Link>
                <button
                  type="button"
                  onClick={() => descartar(item.id)}
                  disabled={removing === item.id}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-700 px-2 py-1.5 cursor-pointer disabled:opacity-50"
                  aria-label="Descartar rascunho"
                >
                  <Trash2 size={14} /> Descartar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
