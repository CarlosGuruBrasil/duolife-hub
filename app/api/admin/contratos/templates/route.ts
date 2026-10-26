import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { logger } from '@/lib/logger';
import {
  listContractTemplates,
  createContractTemplate,
} from '@/lib/contract-templates-service';
import { recordActionAudit } from '@/lib/action-audit';

export async function GET(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const ramoId = searchParams.get('ramo_id') || searchParams.get('ramoId') || undefined;
    const ativoParam = searchParams.get('ativo');
    const ativo = ativoParam !== null ? ativoParam === 'true' || ativoParam === '1' : undefined;

    const templates = await listContractTemplates({ ramoId, ativo });

    return Response.json({
      ok: true,
      templates,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'api.admin.contratos.templates.get.failed');
    return Response.json({ error: 'Erro ao listar templates de contrato', details: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      slug,
      ramo_id,
      nome,
      descricao,
      versao,
      ativo = true,
      titulo,
      subtitulo,
      declaracao_texto,
      tabela_proponente,
      tabela_condicoes,
      configuracoes,
    } = body;

    if (!slug || typeof slug !== 'string' || !slug.trim()) {
      return Response.json({ error: 'O slug do template é obrigatório' }, { status: 400 });
    }

    if (!ramo_id || typeof ramo_id !== 'string' || !ramo_id.trim()) {
      return Response.json({ error: 'O ramo_id é obrigatório (ex: rc-advogados, rc-medicos)' }, { status: 400 });
    }

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return Response.json({ error: 'O nome do template é obrigatório' }, { status: 400 });
    }

    if (!titulo || typeof titulo !== 'string' || !titulo.trim()) {
      return Response.json({ error: 'O título do documento é obrigatório' }, { status: 400 });
    }

    if (!declaracao_texto || typeof declaracao_texto !== 'string' || !declaracao_texto.trim()) {
      return Response.json({ error: 'O texto legal da declaração é obrigatório' }, { status: 400 });
    }

    const created = await createContractTemplate({
      slug,
      ramo_id,
      nome,
      descricao,
      versao,
      ativo,
      titulo,
      subtitulo,
      declaracao_texto,
      tabela_proponente,
      tabela_condicoes,
      configuracoes,
    });

    await recordActionAudit({
      userId: user.userId,
      userName: user.name || user.email,
      userEmail: user.email,
      userRole: user.role,
      module: 'contratos',
      action: 'criar_template',
      targetType: 'contract_template',
      targetId: created.id,
      description: `Criou o template de contrato "${created.nome}" (slug: ${created.slug})`,
      metadata: { slug: created.slug, ramo_id: created.ramo_id, versao: created.versao },
      req,
    });

    return Response.json({
      ok: true,
      template: created,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'api.admin.contratos.templates.post.failed');
    return Response.json({ error: 'Erro ao criar template de contrato', details: message }, { status: 500 });
  }
}
