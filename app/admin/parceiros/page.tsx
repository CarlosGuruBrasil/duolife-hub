'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle, Clock, XCircle } from 'lucide-react';

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

  async function load() {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/admin/parceiros${qs}`);
    const data = await res.json();
    setParceiros(data.parceiros ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await fetch('/api/admin/parceiros', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parceiro_id: id, status }),
    });
    await load();
    setUpdating(null);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Building2 size={24} style={{ color: 'var(--primary)' }} />
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--primary)' }}>Parceiros</h1>
          <p className="text-gray-500 text-sm">
            {statusFilter ? `Filtro: ${STATUS_LABELS[statusFilter]?.label ?? statusFilter}` : 'Todos os parceiros'}
          </p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : parceiros.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum parceiro encontrado.</div>
        ) : (
          <table className="w-full text-sm">
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
                      {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 justify-end">
                        <Link
                          href={`/admin/parceiros/${p.id}`}
                          className="btn-outline text-xs px-3 py-1.5 min-h-0"
                        >
                          Configurar
                        </Link>
                        {p.status !== 'active' && (
                          <button
                            onClick={() => updateStatus(p.id, 'active')}
                            disabled={updating === p.id}
                            className="btn-primary text-xs px-3 py-1.5 min-h-0"
                          >
                            Aprovar
                          </button>
                        )}
                        {p.status !== 'suspended' && (
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
