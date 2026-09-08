'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, UserCheck } from 'lucide-react';
import { AdminClientRow } from '@/types/admin-clients';

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguard. assinatura',
  assinado: 'Assinado',
  pagamento_gerado: 'Cobrança gerada',
  aprovada: 'Aprovada',
  paid: 'Pago',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  pending: 'Pendente',
  refunded: 'Estornado',
  confirmed: 'Confirmado',
  received: 'Recebido',
};

const statusBadgeColor: Record<string, string> = {
  assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partially_paid: 'bg-amber-50 text-amber-800 border-amber-200',
  contrato_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  pagamento_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  rascunho: 'bg-gray-100 text-gray-700 border-gray-200',
};

function formatDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ClientesCardMobile({ client }: { client: AdminClientRow }) {
  const initials = client.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  const sigStatus = client.last_signature_status || client.last_quote_status;
  const payStatus = client.last_payment_status;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs space-y-3">
      {/* Topo do Card: Avatar, Nome, CPF e Status Principal */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0e4a5a]/10 text-xs font-extrabold text-[#0e4a5a]">
            {initials || <UserCheck size={16} />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{client.full_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatDocument(client.document_number)}</p>
          </div>
        </div>

        {/* Badge de Assinatura / Proposta */}
        {sigStatus && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
              statusBadgeColor[sigStatus] || 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            {statusLabel[sigStatus] || sigStatus}
          </span>
        )}
      </div>

      {/* Contato & Parceiro */}
      <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-gray-600 border-t border-gray-100">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Contato</span>
          <div className="truncate mt-0.5">{client.email || client.phone || '-'}</div>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Parceiro</span>
          <div className="truncate mt-0.5 font-medium">{client.partner_names || '-'}</div>
        </div>
      </div>

      {/* Métricas: Produtos e Cotações */}
      <div className="grid grid-cols-3 gap-2 py-2 bg-gray-50/80 rounded-xl px-3 text-center text-xs">
        <div>
          <span className="block text-[10px] font-semibold text-gray-400">Produtos</span>
          <span className="font-bold text-gray-800">{client.products_count}</span>
        </div>
        <div>
          <span className="block text-[10px] font-semibold text-gray-400">Cotações</span>
          <span className="font-bold text-gray-800">{client.cotacoes_count}</span>
        </div>
        <div>
          <span className="block text-[10px] font-semibold text-gray-400">Parcelas</span>
          <span className="font-bold text-gray-800">
            {client.total_installments > 0 ? `${client.paid_installments}/${client.total_installments}` : '-'}
          </span>
        </div>
      </div>

      {/* Rodapé do Card: Data e Link de Ação */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
        <span className="text-gray-400 text-[11px]">
          Cadastrado em {formatDate(client.created_at)}
        </span>

        <Link
          href={`/admin/clientes/${client.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0e4a5a] hover:text-[#0b3a47] py-1.5 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          Ver operação <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
