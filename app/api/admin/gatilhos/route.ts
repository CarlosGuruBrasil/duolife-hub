import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import {
  ensureDefaultTriggers,
} from '@/lib/triggers/dispatcher';
import type {
  AutomationTriggerRecord,
  EventoDominio,
} from '@/lib/triggers/types';

export const EVENTOS_DISPONIVEIS: Array<{ codigo: EventoDominio; nome: string; descricao: string }> = [
  {
    codigo: 'COTACAO_CRIADA',
    nome: 'Cotação Criada',
    descricao: 'Disparado quando um parceiro ou cliente final gera uma nova cotação de seguro no portal.',
  },
  {
    codigo: 'PROPOSTA_ENVIADA',
    nome: 'Proposta Enviada',
    descricao: 'Disparado quando os termos da cotação são submetidos formalmente para análise ou contratação.',
  },
  {
    codigo: 'CONTRATO_ASSINADO',
    nome: 'Contrato Assinado (ZapSign)',
    descricao: 'Disparado via webhook quando o documento eletrônico é 100% assinado por todas as partes.',
  },
  {
    codigo: 'CONTRATO_RECUSADO',
    nome: 'Contrato Recusado / Cancelado',
    descricao: 'Disparado quando o signatário recusa a assinatura ou o documento é cancelado no ZapSign.',
  },
  {
    codigo: 'FATURA_GERADA',
    nome: 'Fatura / Boleto Gerado (Asaas)',
    descricao: 'Disparado automaticamente assim que a cobrança Asaas é criada com link de boleto e PIX.',
  },
  {
    codigo: 'PAGAMENTO_CONFIRMADO',
    nome: 'Pagamento Confirmado (Asaas)',
    descricao: 'Disparado quando a cobrança Pix, Boleto ou Cartão é compensada e aprovada.',
  },
  {
    codigo: 'FATURA_VENCIDA',
    nome: 'Fatura Vencida / Inadimplência',
    descricao: 'Disparado quando uma cobrança atinge a data de vencimento sem confirmação financeira.',
  },
  {
    codigo: 'APOLICE_EMITIDA',
    nome: 'Apólice Emitida',
    descricao: 'Disparado após a confirmação do pagamento e geração oficial da apólice no sistema.',
  },
  {
    codigo: 'LEAD_CRIADO',
    nome: 'Novo Lead / Contato Recebido',
    descricao: 'Disparado na recepção de um novo formulário de interesse ou importação do Wix.',
  },
  {
    codigo: 'RECUPERAR_SENHA',
    nome: 'Recuperação de Senha',
    descricao: 'Disparado quando um usuário (parceiro ou admin) solicita a redefinição de sua senha de acesso.',
  },
];

export async function GET() {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    // Garante que árvores padrões existam
    await ensureDefaultTriggers();

    const triggers = await sql<AutomationTriggerRecord[]>`
      SELECT id, code, name, description, event_type, is_active, tree_definition, created_at, updated_at
      FROM automation_triggers
      ORDER BY updated_at DESC, name ASC
    `;

    return Response.json({
      ok: true,
      triggers,
      eventosDisponiveis: EVENTOS_DISPONIVEIS,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.gatilhos.get.failed');
    return Response.json({ error: 'Erro ao buscar árvores de automação', details: err?.message }, { status: 500 });
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
    const { name, description, event_type, code, is_active = true, tree_definition } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Nome da árvore de automação é obrigatório' }, { status: 400 });
    }

    if (!event_type || typeof event_type !== 'string' || !event_type.trim()) {
      return Response.json({ error: 'Evento gatilho raiz é obrigatório' }, { status: 400 });
    }

    const normalizedCode = (
      code && typeof code === 'string' && code.trim()
        ? code.trim().toLowerCase()
        : `trigger_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
    ) || `trigger_${Date.now()}`;

    // Definição inicial da árvore caso não fornecida
    const finalTreeDefinition = tree_definition && typeof tree_definition === 'object' && Array.isArray(tree_definition.nos)
      ? tree_definition
      : {
          nos: [
            {
              id: `root-${Date.now()}`,
              tipo: 'GATILHO',
              titulo: name.trim(),
              subtitulo: `Gatilho Selecionado: ${event_type}`,
              parentId: null,
              ativo: true,
              posicaoX: 500,
              posicaoY: 60,
              configuracao: { gatilho_codigo: event_type },
            },
          ],
        };

    const [created] = await sql<AutomationTriggerRecord[]>`
      INSERT INTO automation_triggers (
        code, name, description, event_type, is_active, tree_definition, updated_at
      ) VALUES (
        ${normalizedCode},
        ${name.trim()},
        ${description ? String(description).trim() : null},
        ${event_type.trim()},
        ${Boolean(is_active)},
        ${sql.json(finalTreeDefinition)},
        NOW()
      )
      RETURNING id, code, name, description, event_type, is_active, tree_definition, created_at, updated_at
    `;

    return Response.json({
      ok: true,
      trigger: created,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.gatilhos.post.failed');
    if (err?.code === '23505') {
      return Response.json({ error: 'Já existe um gatilho cadastrado com este identificador/código.' }, { status: 409 });
    }
    return Response.json({ error: 'Erro ao cadastrar árvore de decisão', details: err?.message }, { status: 500 });
  }
}
