import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Users, UserCheck } from 'lucide-react';
import { getPartnerAccessContext, verifyPartnerAuth } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getPortalClientsList } from '@/lib/portal-clients-service';
import {
  PageSizeOption,
  PeriodPreset,
  PortalClientSortField,
  SortDirection,
} from '@/types/portal-clients';
import { PortalClientesFilterSection } from './_components/PortalClientesFilterSection';
import { PortalClientesSortHeader } from './_components/PortalClientesSortHeader';
import { PortalClientesPagination } from './_components/PortalClientesPagination';
import { PortalClientesCardMobile } from './_components/PortalClientesCardMobile';

export const dynamic = 'force-dynamic';

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
  cancelled: 'Cancelado',
  refused: 'Recusado',
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

export default async function PortalClientesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');
  const access = await getPartnerAccessContext(user);
  if (!access) redirect('/login');

  await ensureSchema();

  const rawParams = searchParams ? await searchParams : {};

  const page = Math.max(1, Number(typeof rawParams.page === 'string' ? rawParams.page : '1') || 1);
  const pageSize = ([10, 20, 50, 100].includes(Number(rawParams.pageSize))
    ? Number(rawParams.pageSize)
    : 20) as PageSizeOption;
  const sort = typeof rawParams.sort === 'string' ? (rawParams.sort as PortalClientSortField) : 'updated_at';
  const direction =
    typeof rawParams.direction === 'string' && rawParams.direction.toLowerCase() === 'asc'
      ? ('asc' as SortDirection)
      : ('desc' as SortDirection);

  const q = typeof rawParams.q === 'string' ? rawParams.q : undefined;
  const productId = typeof rawParams.productId === 'string' ? rawParams.productId : undefined;
  const signatureStatus = typeof rawParams.signatureStatus === 'string' ? rawParams.signatureStatus : undefined;
  const paymentStatus = typeof rawParams.paymentStatus === 'string' ? rawParams.paymentStatus : undefined;
  const periodPreset =
    typeof rawParams.periodPreset === 'string' ? (rawParams.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof rawParams.startDate === 'string' ? rawParams.startDate : undefined;
  const endDate = typeof rawParams.endDate === 'string' ? rawParams.endDate : undefined;

  const result = await getPortalClientsList(access, {
    page,
    pageSize,
    sort,
    direction,
    q,
    productId,
    signatureStatus,
    paymentStatus,
    periodPreset,
    startDate,
    endDate,
  });

  const { items: clients, pagination, filters } = result;
  const hasActiveFilters = Boolean(
    q ||
    productId ||
    signatureStatus ||
    paymentStatus ||
    (periodPreset && periodPreset !== 'all')
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Acompanhe sua carteira de segurados, produtos contratados, assinaturas e parcelas.
          </p>
        </div>
      </div>

      {/* Seção de Filtros (Busca reativa a cada tecla, filtros por datas/assinatura/parcelas e badges) */}
      <PortalClientesFilterSection
        products={filters.availableProducts}
        pageSize={pageSize}
      />

      {/* Container de Resultados: Tabela Desktop e Cards Mobile */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {clients.length === 0 ? (
          <div className="px-6 py-16 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400">
              <Users size={26} />
            </div>
            <h2 className="text-base font-bold text-gray-900">
              {hasActiveFilters ? 'Nenhum cliente encontrado' : 'Nenhum cliente com operação registrada'}
            </h2>
            <p className="text-gray-500 mx-auto max-w-md text-xs font-medium">
              {hasActiveFilters
                ? 'Nenhum registro corresponde aos filtros e buscas aplicados. Ajuste os filtros ou limpe para ver toda a carteira.'
                : 'Quando as cotações forem criadas, os clientes aparecerão aqui com histórico de assinatura e pagamento.'}
            </p>
            {hasActiveFilters && (
              <Link
                href="/portal/clientes"
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0e4a5a] text-white text-xs font-bold hover:bg-[#072a33] transition-colors shadow-xs"
              >
                Limpar todos os filtros
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Visualização em Cartões Mobile (<= 768px) */}
            <div className="md:hidden divide-y divide-gray-100 p-3 space-y-3">
              {clients.map((client) => (
                <PortalClientesCardMobile key={client.id} client={client} />
              ))}
            </div>

            {/* Visualização em Tabela Desktop (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-200">
                  <tr>
                    <PortalClientesSortHeader field="full_name" currentSort={sort} currentDirection={direction}>
                      Cliente
                    </PortalClientesSortHeader>
                    <PortalClientesSortHeader field="email" currentSort={sort} currentDirection={direction}>
                      Contato
                    </PortalClientesSortHeader>
                    <PortalClientesSortHeader field="products_count" currentSort={sort} currentDirection={direction} align="center">
                      Produtos
                    </PortalClientesSortHeader>
                    <PortalClientesSortHeader field="cotacoes_count" currentSort={sort} currentDirection={direction} align="center">
                      Cotações
                    </PortalClientesSortHeader>
                    <PortalClientesSortHeader field="last_signature_status" currentSort={sort} currentDirection={direction}>
                      Assinatura
                    </PortalClientesSortHeader>
                    <PortalClientesSortHeader field="paid_installments" currentSort={sort} currentDirection={direction}>
                      Parcelas
                    </PortalClientesSortHeader>
                    <PortalClientesSortHeader field="updated_at" currentSort={sort} currentDirection={direction}>
                      Atualização
                    </PortalClientesSortHeader>
                    <th scope="col" className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map((client) => {
                    const sigStatus = client.last_signature_status || client.last_quote_status;
                    const payStatus = client.last_payment_status;

                    return (
                      <tr key={client.id} className="hover:bg-gray-50/80 transition-colors duration-150">
                        {/* Cliente: Nome e Documento */}
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-900">{client.full_name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{formatDocument(client.document_number)}</div>
                        </td>

                        {/* Contato */}
                        <td className="px-5 py-4 text-gray-600">
                          <div className="text-gray-900 text-xs font-medium">{client.email || '-'}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{client.phone || '-'}</div>
                        </td>

                        {/* Produtos */}
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-700">
                            {client.products_count}
                          </span>
                        </td>

                        {/* Cotações */}
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-700">
                            {client.cotacoes_count}
                          </span>
                        </td>

                        {/* Status da Assinatura */}
                        <td className="px-5 py-4">
                          {sigStatus ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                                statusBadgeColor[sigStatus] || 'bg-gray-50 text-gray-700 border-gray-200'
                              }`}
                            >
                              {statusLabel[sigStatus] || sigStatus}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>

                        {/* Parcelas / Pagamento */}
                        <td className="px-5 py-4 text-gray-600">
                          {client.total_installments > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-gray-900 text-xs">
                                {client.paid_installments}/{client.total_installments} parcelas
                              </span>
                              {payStatus && (
                                <span className="text-[11px] text-gray-500">
                                  {statusLabel[payStatus] || payStatus}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>

                        {/* Última atualização */}
                        <td className="px-5 py-4 text-gray-500 text-xs">
                          {client.updated_at ? formatDate(client.updated_at) : formatDate(client.created_at)}
                        </td>

                        {/* Link de Ação */}
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/portal/clientes/${client.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0e4a5a]/5 text-[#0e4a5a] font-bold text-xs hover:bg-[#0e4a5a]/10 transition-colors"
                          >
                            <span>Ver operação</span>
                            <ArrowRight size={13} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <PortalClientesPagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalRecords={pagination.total}
              pageSize={pageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
