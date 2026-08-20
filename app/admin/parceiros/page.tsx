'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { formatDate } from '@/lib/format';

interface Parceiro {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:    { label: 'Ativo',     color: '#417572', icon: CheckCircle },
  pending:   { label: 'Pendente',  color: '#b45309', icon: Clock },
  suspended: { label: 'Suspenso',  color: '#b91c1c', icon: XCircle },
};

function AdminParceirosInner() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [canManageStatus, setCanManageStatus] = useState(false);

  async function load() {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/admin/parceiros${qs}`);
    const data = await res.json();
    setParceiros(data.parceiros ?? []);
    setCanManageStatus(Boolean(data.canManageStatus));
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function updateStatus(id: string, status: string) {
    const action = status === 'suspended' ? 'suspender' : 'ativar';
    if (!window.confirm(`Deseja ${action} este parceiro?`)) return;

    setUpdating(id);
    try {
      const response = await fetch('/api/admin/parceiros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parceiro_id: id, status }),
      });
      if (!response.ok) {
        window.alert('Não foi possível atualizar o parceiro. Tente novamente.');
        return;
      }
      await load();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">REDE & CORRETORAS</span>
          <h1 className="admin-page-title">Parceiros</h1>
          <p className="admin-page-copy">
            {statusFilter ? `Filtro: ${STATUS_LABELS[statusFilter]?.label ?? statusFilter}` : 'Gestão de parceiros e corretoras habilitadas.'}
          </p>
        </div>
      </section>

      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : parceiros.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum parceiro encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-gray)' }}>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Empresa</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">CNPJ</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">E-mail</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Cadastro</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {parceiros.map((p) => {
                const s = STATUS_LABELS[p.status] ?? { label: p.status, color: '#666', icon: Clock };
                const Icon = s.icon;
                return (
                  <tr key={p.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-6 py-4">
                      <div className="font-semibold">{p.razao_social}</div>
                      {p.nome_fantasia && p.nome_fantasia !== p.razao_social && (
                        <div className="text-xs text-gray-400">{p.nome_fantasia}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{p.cnpj}</td>
                    <td className="px-6 py-4 text-gray-500">{p.email}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: `${s.color}18`, color: s.color }}>
                        <Icon size={12} /> {s.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 justify-end">
                        <Link
                          href={`/admin/parceiros/${p.id}`}
                          className="btn-outline text-xs px-3 py-1.5 min-h-0"
                        >
                          Gerenciar
                        </Link>
                        {canManageStatus && p.status !== 'active' && (
                          <button
                            onClick={() => updateStatus(p.id, 'active')}
                            disabled={updating === p.id}
                            className="btn-primary text-xs px-3 py-1.5 min-h-0"
                          >
                            Ativar
                          </button>
                        )}
                        {canManageStatus && p.status !== 'suspended' && (
                          <button
                            onClick={() => updateStatus(p.id, 'suspended')}
                            disabled={updating === p.id}
                            className="btn-outline text-xs px-3 py-1.5 min-h-0"
                            style={{ color: '#b91c1c', borderColor: '#b91c1c' }}
                          >
                            Suspender
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminParceiros() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando...</div>}>
      <AdminParceirosInner />
    </Suspense>
  );
}
