'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, UserCheck } from 'lucide-react';
import { PortalClientRow } from '@/types/portal-clients';
import { formatStatusLabel } from '@/lib/format';

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  contrato_gerado: 'Aguard. assinatura',
  assinado: 'Assinado',
  signed: 'Assinado',
  pagamento_gerado: 'Cobrança gerada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  paid: 'Pago',
  confirmed: 'Confirmado',
  received: 'Recebido',
  partially_paid: 'Parcial',
  overdue: 'Vencido',
  pending: 'Pendente',
  refunded: 'Estornado',
};

const statusBadgeColor: Record<string, string> = {
  assinado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partially_paid: 'bg-amber-50 text-amber-800 border-amber-200',
  contrato_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  pagamento_gerado: 'bg-amber-50 text-amber-800 border-amber-200',
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  enviada: 'bg-blue-50 text-blue-700 border-blue-200',
  overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  recusada: 'bg-rose-50 text-rose-700 border-rose-200',
  expirada: 'bg-rose-50 text-rose-700 border-rose-200',
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

export function PortalClientesCardMobile({ client }: { client: PortalClientRow }) {
  const initials = client.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  const sigStatus = (() => {
    const quoteSt = String(client.last_quote_status || '').toLowerCase();
    const sigSt = String(client.last_signature_status || '').toLowerCase();
    const paySt = String(client.last_payment_status || '').toLowerCase();

    if (['emitida', 'ativa'].includes(quoteSt)) return 'emitida';
    if (['aprovada', 'approved'].includes(quoteSt)) return 'aprovada';
    if (['paid', 'confirmed', 'received'].includes(paySt) && (client.paid_installments ?? 0) >= (client.total_installments || 1)) {
      return 'aprovada';
    }
    if (['assinado', 'signed'].includes(sigSt) || ['assinado', 'signed'].includes(quoteSt)) {
      return 'assinado';
    }
    if (quoteSt === 'pagamento_gerado') return 'pagamento_gerado';
    if (['contrato_gerado', 'pending'].includes(sigSt) || quoteSt === 'contrato_gerado') {
      return 'contrato_gerado';
    }
    return client.last_quote_status || client.last_signature_status || null;
  })();
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

        {/* Badge de Status */}
        {sigStatus && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
              statusBadgeColor[sigStatus.toLowerCase()] || statusBadgeColor[sigStatus] || 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            {formatStatusLabel(sigStatus)}
          </span>
        )}
      </div>

      {/* Contato */}
      <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-gray-600 border-t border-gray-100">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">E-mail</span>
          <div className="truncate mt-0.5">{client.email || '-'}</div>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Telefone</span>
          <div className="truncate mt-0.5 font-medium">{client.phone || '-'}</div>
        </div>
      </div>

      {/* Métricas: Produtos, Cotações e Parcelas */}
      <div className="grid grid-cols-3 gap-2 pt-2 text-xs text-gray-600 border-t border-gray-100">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Produtos</span>
          <span className="font-bold text-gray-900 text-sm mt-0.5 block">{client.products_count}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Cotações</span>
          <span className="font-bold text-gray-900 text-sm mt-0.5 block">{client.cotacoes_count}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Parcelas</span>
          <span className="font-semibold text-gray-700 text-xs mt-0.5 block truncate">
            {client.total_installments > 0
              ? `${client.paid_installments}/${client.total_installments}`
              : '-'}
          </span>
        </div>
      </div>

      {/* Rodapé: Data e Link de Ação */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
        <span className="text-gray-400 text-[11px]">
          {client.updated_at ? formatDate(client.updated_at) : formatDate(client.created_at)}
        </span>
        <Link
          href={`/portal/clientes/${client.id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0e4a5a]/5 text-[#0e4a5a] font-bold text-xs hover:bg-[#0e4a5a]/10 transition-colors"
        >
          <span>Ver operação</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
