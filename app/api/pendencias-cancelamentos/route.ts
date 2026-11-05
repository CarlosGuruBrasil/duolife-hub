import {
  verifyAuth,
  isInternalUser,
  getPartnerAccessContext,
  unauthorized,
  type PartnerAccessContext,
} from '@/lib/auth';
import { getPendenciasCancelamentosList } from '@/lib/pendencias-cancelamentos-service';
import { logger } from '@/lib/logger';
import type {
  PendenciasFiltros,
  PendenciaTab,
  TipoRegistro,
} from '@/types/pendencias-cancelamentos';

export async function GET(req: Request): Promise<Response> {
  const user = await verifyAuth();
  if (!user) {
    return unauthorized();
  }

  let access: PartnerAccessContext | null = null;
  if (isInternalUser(user)) {
    access = {
      partnerId: null,
      corretoraId: null,
      isCorretoraUser: false,
      isInternal: true,
      partnerRole: null,
      role: user.role,
      visibleUserIds: null,
    };
  } else {
    access = await getPartnerAccessContext(user);
  }

  if (!access) {
    return Response.json(
      { error: 'Acesso negado para este perfil' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);

  const tab = searchParams.get('tab') as PendenciaTab | null;
  const q = searchParams.get('q') || undefined;
  const corretoraId = searchParams.get('corretoraId') || undefined;
  const partnerId = searchParams.get('partnerId') || undefined;
  const managerUserId = searchParams.get('managerUserId') || undefined;
  const vendedorUserId = searchParams.get('vendedorUserId') || undefined;
  const productId = searchParams.get('productId') || undefined;
  const tipoRegistro = searchParams.get('tipoRegistro') as TipoRegistro | 'todos' | null;
  const situacao = searchParams.get('situacao') || undefined;
  const motivoCancelamento = searchParams.get('motivoCancelamento') || undefined;

  const diasAtrasoMinRaw = searchParams.get('diasAtrasoMin');
  const diasAtrasoMin =
    diasAtrasoMinRaw !== null && diasAtrasoMinRaw !== '' && !Number.isNaN(Number(diasAtrasoMinRaw))
      ? Number(diasAtrasoMinRaw)
      : undefined;

  const diasAtrasoMaxRaw = searchParams.get('diasAtrasoMax');
  const diasAtrasoMax =
    diasAtrasoMaxRaw !== null && diasAtrasoMaxRaw !== '' && !Number.isNaN(Number(diasAtrasoMaxRaw))
      ? Number(diasAtrasoMaxRaw)
      : undefined;

  const vencimentoDe = searchParams.get('vencimentoDe') || undefined;
  const vencimentoAte = searchParams.get('vencimentoAte') || undefined;
  const cancelamentoDe = searchParams.get('cancelamentoDe') || undefined;
  const cancelamentoAte = searchParams.get('cancelamentoAte') || undefined;

  const pageRaw = searchParams.get('page');
  const pageNum = pageRaw ? Number(pageRaw) : NaN;
  const page = !Number.isNaN(pageNum) && pageNum > 0 ? pageNum : 1;

  const pageSizeRaw = searchParams.get('pageSize');
  const pageSizeNum = pageSizeRaw ? Number(pageSizeRaw) : NaN;
  const pageSize = !Number.isNaN(pageSizeNum) && pageSizeNum > 0 ? pageSizeNum : 25;

  const orderBy = searchParams.get('orderBy') as PendenciasFiltros['orderBy'];
  const orderDir = searchParams.get('orderDir') as PendenciasFiltros['orderDir'];

  const filtros: PendenciasFiltros = {
    tab: tab || undefined,
    q,
    corretoraId,
    partnerId,
    managerUserId,
    vendedorUserId,
    productId,
    tipoRegistro: tipoRegistro || undefined,
    situacao,
    motivoCancelamento,
    diasAtrasoMin,
    diasAtrasoMax,
    vencimentoDe,
    vencimentoAte,
    cancelamentoDe,
    cancelamentoAte,
    page,
    pageSize,
    orderBy: orderBy || undefined,
    orderDir: orderDir || undefined,
  };

  try {
    const result = await getPendenciasCancelamentosList(access, filtros);
    return Response.json(result);
  } catch (err) {
    logger.error({ err, userId: user.userId }, 'pendencias_cancelamentos.list.failed');
    return Response.json(
      { error: 'Erro interno ao consultar pendências e cancelamentos' },
      { status: 500 }
    );
  }
}
