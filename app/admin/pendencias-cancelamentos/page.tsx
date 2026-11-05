import { redirect } from 'next/navigation';
import { verifyAdminAuth, type PartnerAccessContext } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { getPendenciasCancelamentosList } from '@/lib/pendencias-cancelamentos-service';
import { PendenciasCancelamentosView } from '@/components/pendencias/PendenciasCancelamentosView';
import AdminShell from '../_components/AdminShell';
import type {
  PendenciasFiltros,
  PendenciaTab,
  TipoRegistro,
} from '@/types/pendencias-cancelamentos';

export const dynamic = 'force-dynamic';

function parseSearchParamString(val: string | string[] | undefined): string | undefined {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(val) && typeof val[0] === 'string') {
    const trimmed = val[0].trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function parseSearchParamNumber(val: string | string[] | undefined): number | undefined {
  const str = parseSearchParamString(val);
  if (!str) return undefined;
  const num = Number(str);
  return Number.isNaN(num) ? undefined : num;
}

export function parsePendenciasFiltros(
  rawParams: Record<string, string | string[] | undefined> = {}
): PendenciasFiltros {
  const rawTab = parseSearchParamString(rawParams.tab);
  const tab: PendenciaTab | undefined =
    rawTab === 'em_atraso' || rawTab === 'canceladas' || rawTab === 'visao_geral'
      ? rawTab
      : undefined;

  const rawTipo = parseSearchParamString(rawParams.tipoRegistro);
  const tipoRegistro: TipoRegistro | 'todos' | undefined =
    rawTipo === 'cotacao' || rawTipo === 'venda' || rawTipo === 'todos'
      ? rawTipo
      : undefined;

  const rawOrderBy = parseSearchParamString(rawParams.orderBy);
  const orderBy: PendenciasFiltros['orderBy'] =
    rawOrderBy === 'vencimento' ||
    rawOrderBy === 'dias_atraso' ||
    rawOrderBy === 'valor' ||
    rawOrderBy === 'data_cancelamento'
      ? rawOrderBy
      : undefined;

  const rawOrderDir = parseSearchParamString(rawParams.orderDir);
  const orderDir: PendenciasFiltros['orderDir'] =
    rawOrderDir === 'asc' || rawOrderDir === 'desc'
      ? rawOrderDir
      : undefined;

  const pageNum = parseSearchParamNumber(rawParams.page);
  const page = pageNum && pageNum > 0 ? pageNum : 1;

  const pageSizeNum = parseSearchParamNumber(rawParams.pageSize);
  const pageSize = pageSizeNum && pageSizeNum > 0 ? pageSizeNum : 25;

  return {
    tab,
    q: parseSearchParamString(rawParams.q),
    corretoraId: parseSearchParamString(rawParams.corretoraId),
    partnerId: parseSearchParamString(rawParams.partnerId),
    managerUserId: parseSearchParamString(rawParams.managerUserId),
    vendedorUserId: parseSearchParamString(rawParams.vendedorUserId),
    productId: parseSearchParamString(rawParams.productId),
    tipoRegistro,
    situacao: parseSearchParamString(rawParams.situacao),
    motivoCancelamento: parseSearchParamString(rawParams.motivoCancelamento),
    diasAtrasoMin: parseSearchParamNumber(rawParams.diasAtrasoMin),
    diasAtrasoMax: parseSearchParamNumber(rawParams.diasAtrasoMax),
    vencimentoDe: parseSearchParamString(rawParams.vencimentoDe),
    vencimentoAte: parseSearchParamString(rawParams.vencimentoAte),
    cancelamentoDe: parseSearchParamString(rawParams.cancelamentoDe),
    cancelamentoAte: parseSearchParamString(rawParams.cancelamentoAte),
    page,
    pageSize,
    orderBy,
    orderDir,
  };
}

export default async function AdminPendenciasCancelamentosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const user = await verifyAdminAuth();
  if (!user) {
    redirect('/login');
  }

  await ensureSchema();

  const access: PartnerAccessContext = {
    partnerId: null,
    corretoraId: null,
    isCorretoraUser: false,
    isInternal: true,
    partnerRole: null,
    role: user.role,
    visibleUserIds: null,
  };

  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const filtros = parsePendenciasFiltros(resolvedParams);

  const initialData = await getPendenciasCancelamentosList(access, filtros);

  return (
    <AdminShell user={user}>
      <PendenciasCancelamentosView
        initialData={initialData}
        baseRoute="/admin"
        initialTab={filtros.tab || 'em_atraso'}
      />
    </AdminShell>
  );
}
