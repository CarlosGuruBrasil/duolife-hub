import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Users, UserCheck, ShieldCheck } from 'lucide-react';
import { verifyAuth, isInternalUser } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getAdminClientsList } from '@/lib/admin-clients-service';
import {
  ClientSortField,
  PageSizeOption,
  PeriodPreset,
  QuotesFilterType,
  SortDirection,
} from '@/types/admin-clients';
import { ClientesSortHeader } from './_components/ClientesSortHeader';
import { ClientesPagination } from './_components/ClientesPagination';
import { ClientesCardMobile } from './_components/ClientesCardMobile';
import { ClientesFilterSection } from './_components/ClientesFilterSection';

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

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await verifyAuth();
  if (!user || !isInternalUser(user)) {
    redirect('/login');
  }

  await ensureSchema();

  const rawParams = searchParams ? await searchParams : {};

  const page = Math.max(1, Number(typeof rawParams.page === 'string' ? rawParams.page : '1') || 1);
  const pageSize = ([10, 20, 50, 100].includes(Number(rawParams.pageSize))
    ? Number(rawParams.pageSize)
    : 20) as PageSizeOption;
  const sort = typeof rawParams.sort === 'string' ? (rawParams.sort as ClientSortField) : 'created_at';
  const direction =
    typeof rawParams.direction === 'string' && rawParams.direction.toLowerCase() === 'asc'
      ? ('asc' as SortDirection)
      : ('desc' as SortDirection);
  const q = typeof rawParams.q === 'string' ? rawParams.q : undefined;
  const productId = typeof rawParams.productId === 'string' ? rawParams.productId : undefined;
  const quotesFilter =
    typeof rawParams.quotesFilter === 'string' ? (rawParams.quotesFilter as QuotesFilterType) : undefined;
  const quoteStatus = typeof rawParams.quoteStatus === 'string' ? rawParams.quoteStatus : undefined;
  const signatureStatus = typeof rawParams.signatureStatus === 'string' ? rawParams.signatureStatus : undefined;
  const paymentStatus = typeof rawParams.paymentStatus === 'string' ? rawParams.paymentStatus : undefined;
  const partnerId = typeof rawParams.partnerId === 'string' ? rawParams.partnerId : undefined;
  const periodPreset =
    typeof rawParams.periodPreset === 'string' ? (rawParams.periodPreset as PeriodPreset) : undefined;
  const startDate = typeof rawParams.startDate === 'string' ? rawParams.startDate : undefined;
  const endDate = typeof rawParams.endDate === 'string' ? rawParams.endDate : undefined;

  const result = await getAdminClientsList({
    page,
    pageSize,
    sort,
    direction,
    q,
    productId,
    quotesFilter,
    quoteStatus,
    signatureStatus,
    paymentStatus,
    partnerId,
    periodPreset,
    startDate,
    endDate,
  });

  const { items: clients, pagination, filters } = result;
  const hasActiveFilters = Boolean(
    q ||
    productId ||
    (quotesFilter && quotesFilter !== 'all') ||
    quoteStatus ||
    signatureStatus ||
    paymentStatus ||
    partnerId ||
    (periodPreset && periodPreset !== 'all')
  );

  return (
    <div className="space-y-6">
      {/* Header Oficial no Container admin-hero-card */}
      <section className="admin-hero-card">
        <div>
          <span className="admin-eyebrow">CARTEIRA & SEGURADOS</span>
          <h1 className="admin-page-title">Clientes</h1>
          <p className="admin-page-copy">Base consolidada dos segurados com produtos, assinatura e parcelas.</p>
        </div>
      </section>

      {/* Seção de Filtros (Busca universal, filtros avançados e badges) */}
      <ClientesFilterSection
        products={filters.availableProducts}
        partners={filters.availablePartners}
        pageSize={pageSize}
      />

      {/* Container Principal da Tabela / Cards Mobile */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {clients.length === 0 ? (
          <div className="px-6 py-20 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400">
              <Users size={28} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {hasActiveFilters ? 'Nenhum cliente encontrado' : 'Nenhum cliente com operação registrada'}
            </h2>
            <p className="text-gray-500 mx-auto max-w-md text-xs font-medium">
              {hasActiveFilters
                ? 'Nenhum registro corresponde aos filtros e buscas aplicados. Ajuste os filtros ou limpe para ver toda a carteira.'
                : 'Assim que as contratações forem processadas, a carteira consolidada aparecerá aqui.'}
            </p>
            {hasActiveFilters && (
              <Link
                href="/admin/clientes"
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
                <ClientesCardMobile key={client.id} client={client} />
              ))}
            </div>

            {/* Visualização em Tabela Rica (>= 768px Tablet e Desktop) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-200">
                  <tr>
                    <ClientesSortHeader field="full_name" currentSort={sort} currentDirection={direction}>
                      Cliente
                    </ClientesSortHeader>
                    <ClientesSortHeader field="email" currentSort={sort} currentDirection={direction}>
                      Contato
                    </ClientesSortHeader>
                    <ClientesSortHeader field="partner_names" currentSort={sort} currentDirection={direction}>
                      Parceiros
                    </ClientesSortHeader>
                    <ClientesSortHeader field="products_count" currentSort={sort} currentDirection={direction} align="center">
                      Produtos
                    </ClientesSortHeader>
                    <ClientesSortHeader field="cotacoes_count" currentSort={sort} currentDirection={direction} align="center">
                      Cotações
                    </ClientesSortHeader>
                    <ClientesSortHeader field="last_signature_status" currentSort={sort} currentDirection={direction}>
                      Assinatura
                    </ClientesSortHeader>
                    <ClientesSortHeader field="paid_installments" currentSort={sort} currentDirection={direction}>
                      Parcelas
                    </ClientesSortHeader>
                    <ClientesSortHeader field="created_at" currentSort={sort} currentDirection={direction}>
                      Cadastro
                    </ClientesSortHeader>
                    <ClientesSortHeader field="updated_at" currentSort={sort} currentDirection={direction}>
                      Atualização
                    </ClientesSortHeader>
                    <th scope="col" className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
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
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{client.full_name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{formatDocument(client.document_number)}</div>
                        </td>

                        {/* Contato: Email e Telefone */}
                        <td className="px-6 py-4 text-gray-600">
                          <div className="text-gray-900 text-xs font-medium">{client.email || '-'}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{client.phone || '-'}</div>
                        </td>

                        {/* Parceiros */}
                        <td className="px-6 py-4 text-gray-600 max-w-[240px] truncate" title={client.partner_names || ''}>
                          {client.partner_names || '-'}
                        </td>

                        {/* Produtos */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-teal-50 text-[#0e4a5a] text-xs font-bold border border-teal-100">
                            {client.products_count}
                          </span>
                        </td>

                        {/* Cotações */}
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-gray-100 text-gray-800 text-xs font-bold border border-gray-200">
                            {client.cotacoes_count}
                          </span>
                        </td>

                        {/* Assinatura */}
                        <td className="px-6 py-4 text-gray-600">
                          {sigStatus ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                statusBadgeColor[sigStatus] || 'bg-gray-100 text-gray-700 border-gray-200'
                              }`}
                            >
                              {statusLabel[sigStatus] || sigStatus}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Parcelas e Pagamento */}
                        <td className="px-6 py-4 text-gray-600">
                          {client.total_installments > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 text-xs">
                                {client.paid_installments}/{client.total_installments}
                              </span>
                              {payStatus && (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                    statusBadgeColor[payStatus] || 'bg-gray-100 text-gray-700 border-gray-200'
                                  }`}
                                >
                                  {statusLabel[payStatus] || payStatus}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Data de Cadastro */}
                        <td className="px-6 py-4 text-gray-500 text-xs">
                          {client.created_at ? formatDate(client.created_at) : '-'}
                        </td>

                        {/* Data de Atualização */}
                        <td className="px-6 py-4 text-gray-500 text-xs">
                          {client.updated_at ? formatDate(client.updated_at) : '-'}
                        </td>

                        {/* Ações */}
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/admin/clientes/${client.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0e4a5a] hover:text-[#0b3a47] py-1.5 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors shadow-2xs"
                          >
                            Ver operação <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <ClientesPagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalRecords={pagination.total}
              pageSize={pagination.pageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
