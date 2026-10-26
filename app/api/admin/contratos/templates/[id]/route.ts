import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { logger } from '@/lib/logger';
import {
  getContractTemplateByIdOrSlug,
  updateContractTemplate,
} from '@/lib/contract-templates-service';
import { recordActionAudit } from '@/lib/action-audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const template = await getContractTemplateByIdOrSlug(id);

    if (!template) {
      return Response.json({ error: 'Template de contrato não encontrado' }, { status: 404 });
    }

    return Response.json({ ok: true, template });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, id }, 'api.admin.contratos.templates.id.get.failed');
    return Response.json({ error: 'Erro ao buscar template de contrato', details: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await getContractTemplateByIdOrSlug(id);
    if (!existing) {
      return Response.json({ error: 'Template de contrato não encontrado' }, { status: 404 });
    }

    const body = await req.json();
    const updated = await updateContractTemplate(id, body);

    await recordActionAudit({
      userId: user.userId,
      userName: user.name || user.email,
      userEmail: user.email,
      userRole: user.role,
      module: 'contratos' as any,
      action: 'atualizar_template',
      targetType: 'contract_template',
      targetId: updated.id,
      description: `Atualizou o template de contrato "${updated.nome}" (v${updated.versao})`,
      metadata: {
        slug: updated.slug,
        versaoAnterior: existing.versao,
        novaVersao: updated.versao,
        alteracoes: Object.keys(body),
      },
      req,
    });

    return Response.json({
      ok: true,
      template: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, id }, 'api.admin.contratos.templates.id.put.failed');
    return Response.json({ error: 'Erro ao atualizar template de contrato', details: message }, { status: 500 });
  }
}
