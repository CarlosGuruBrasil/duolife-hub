import { sql } from '../pg';
import { logger } from '../logger';
import { sendTemplatedEmail } from '../email-service';
import { evaluateDecisionTree } from './engine';
import type {
  AutomationTriggerRecord,
  NoArvore,
  TriggerEvaluationContext,
  DestinatarioConfig,
} from './types';

export interface DispatchResult {
  eventType: string;
  evaluatedTriggersCount: number;
  actionsExecutedCount: number;
  errors: string[];
}

/**
 * Dispara um evento de domínio e avalia as árvores de decisão ativas
 */
export async function dispatchDomainEvent(
  eventType: string,
  context: TriggerEvaluationContext
): Promise<DispatchResult> {
  const result: DispatchResult = {
    eventType,
    evaluatedTriggersCount: 0,
    actionsExecutedCount: 0,
    errors: [],
  };

  try {
    // 1. Busca todas as árvores de decisão ativas configuradas para este evento
    const triggers = await sql<AutomationTriggerRecord[]>`
      SELECT id, code, name, description, event_type, is_active, tree_definition, created_at, updated_at
      FROM automation_triggers
      WHERE event_type = ${eventType} AND is_active = true
      ORDER BY created_at ASC
    `;

    result.evaluatedTriggersCount = triggers.length;

    for (const trigger of triggers) {
      const nos: NoArvore[] = trigger.tree_definition?.nos || [];
      if (nos.length === 0) continue;

      const { evaluatedNodes, executableActions } = evaluateDecisionTree(nos, context);

      const actionsExecutedLogs: Array<{
        nodeId: string;
        tipo: NoArvore['tipo'];
        status: 'success' | 'failed' | 'skipped';
        output?: any;
        error?: string;
      }> = [];

      let hasActionError = false;

      // 2. Executa as ações que passaram nos critérios da árvore
      for (const actionNode of executableActions) {
        try {
          if (actionNode.tipo === 'ACAO_EMAIL') {
            const config = actionNode.configuracao || {};
            const templateCode = config.template_id || 'boas_vindas';

            // Resolve destinatários
            const recipientsToDispatch: Array<{ email: string; nome?: string }> = [];

            const destList: DestinatarioConfig[] =
              config.destinatarios && config.destinatarios.length > 0
                ? config.destinatarios
                : [
                    {
                      destinatario_tipo: (config.destinatario_tipo as any) || 'CLIENTE',
                      destinatario_email: config.destinatario_email,
                      destinatario_nome: config.destinatario_nome,
                    },
                  ];

            for (const d of destList) {
              if (d.destinatario_tipo === 'CLIENTE') {
                if (context.cliente?.email) {
                  recipientsToDispatch.push({
                    email: context.cliente.email,
                    nome: context.cliente.nome || 'Cliente',
                  });
                } else if (context.usuario?.email) {
                  recipientsToDispatch.push({
                    email: context.usuario.email,
                    nome: context.usuario.nome || 'Usuário',
                  });
                }
              } else if (d.destinatario_tipo === 'PARCEIRO' && context.parceiro?.email) {
                recipientsToDispatch.push({
                  email: context.parceiro.email,
                  nome: context.parceiro.nome || 'Parceiro',
                });
              } else if (d.destinatario_tipo === 'ADMIN') {
                recipientsToDispatch.push({
                  email: d.destinatario_email || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@duolife.com.br',
                  nome: d.destinatario_nome || 'Operação DuoLife',
                });
              } else if (d.destinatario_tipo === 'PERSONALIZADO' && d.destinatario_email) {
                recipientsToDispatch.push({
                  email: d.destinatario_email,
                  nome: d.destinatario_nome || 'Destinatário',
                });
              }
            }

            // Fallback para quando o evento for de usuário direto e não houver destinatário explícito
            if (recipientsToDispatch.length === 0 && context.usuario?.email) {
              recipientsToDispatch.push({
                email: context.usuario.email,
                nome: context.usuario.nome || 'Usuário',
              });
            }

            // Variáveis formatadas para o template
            const templateVars: Record<string, any> = {
              nome: context.usuario?.nome || context.cliente?.nome || context.parceiro?.nome || 'Cliente',
              email: context.usuario?.email || context.cliente?.email || context.parceiro?.email || '',
              documento: context.cliente?.documento,
              telefone: context.cliente?.telefone,
              cotacao_id: context.cotacao?.id,
              valor: context.cotacao?.premio_final
                ? context.cotacao.premio_final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                : context.transacao?.valor
                ? context.transacao.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                : '0,00',
              cobertura: context.cotacao?.cobertura
                ? context.cotacao.cobertura.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                : '100.000,00',
              produto_nome: context.cotacao?.produto_nome || 'Seguro RC Profissional',
              link_fatura: context.transacao?.link_fatura || '',
              vencimento: context.transacao?.vencimento || '',
              parceiro_nome: context.parceiro?.nome || 'DuoLife',
              codigo_venda: context.parceiro?.codigoVenda || '',
              link_reset: context.dados?.link_reset || context.dados?.reset_url || '',
              reset_url: context.dados?.link_reset || context.dados?.reset_url || '',
              tempo_expiracao: context.dados?.tempo_expiracao || '1 hora',
              ...(context.dados || {}),
            };

            for (const r of recipientsToDispatch) {
              const emailResult = await sendTemplatedEmail({
                templateCode,
                to: r.email,
                toName: r.nome,
                variables: templateVars,
                metadata: {
                  triggerId: trigger.id,
                  nodeId: actionNode.id,
                  eventType,
                  contextId: context.contextId,
                },
              });

              if (!emailResult.success) {
                hasActionError = true;
                result.errors.push(`Falha no envio do e-mail (${templateCode}) para ${r.email}: ${emailResult.error}`);
              }
            }

            actionsExecutedLogs.push({
              nodeId: actionNode.id,
              tipo: 'ACAO_EMAIL',
              status: hasActionError ? 'failed' : 'success',
              output: { recipientsCount: recipientsToDispatch.length, templateCode },
            });

            result.actionsExecutedCount++;
          } else if (actionNode.tipo === 'ACAO_STATUS') {
            const config = actionNode.configuracao || {};
            const novoStatus = config.status;

            if (novoStatus && context.cotacao?.id) {
              await sql`
                UPDATE cotacoes
                SET status = ${novoStatus}, updated_at = NOW()
                WHERE id = ${context.cotacao.id}
              `;
            }

            actionsExecutedLogs.push({
              nodeId: actionNode.id,
              tipo: 'ACAO_STATUS',
              status: 'success',
              output: { novoStatus, cotacaoId: context.cotacao?.id },
            });

            result.actionsExecutedCount++;
          } else if (actionNode.tipo === 'ACAO_WEBHOOK') {
            const config = actionNode.configuracao || {};
            const url = config.webhook_url;

            if (url) {
              await fetch(url, {
                method: config.webhook_method || 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(config.webhook_headers || {}),
                },
                body: JSON.stringify({
                  eventType,
                  contextId: context.contextId,
                  triggerCode: trigger.code,
                  timestamp: new Date().toISOString(),
                  context,
                }),
              });
            }

            actionsExecutedLogs.push({
              nodeId: actionNode.id,
              tipo: 'ACAO_WEBHOOK',
              status: 'success',
              output: { url },
            });

            result.actionsExecutedCount++;
          }
        } catch (actionErr: any) {
          hasActionError = true;
          const msg = actionErr?.message || String(actionErr);
          result.errors.push(`Erro na ação ${actionNode.id} (${actionNode.tipo}): ${msg}`);
          actionsExecutedLogs.push({
            nodeId: actionNode.id,
            tipo: actionNode.tipo,
            status: 'failed',
            error: msg,
          });
        }
      }

      // 3. Salva log de auditoria da árvore
      const finalStatus =
        executableActions.length === 0
          ? 'no_action'
          : hasActionError
          ? 'partial'
          : 'success';

      await sql`
        INSERT INTO automation_trigger_logs (
          trigger_id, event_type, context_id, context_data, evaluated_nodes, actions_executed, status, error_message
        ) VALUES (
          ${trigger.id},
          ${eventType},
          ${context.contextId || null},
          ${sql.json(context as any)},
          ${sql.json(evaluatedNodes as any)},
          ${sql.json(actionsExecutedLogs as any)},
          ${finalStatus},
          ${result.errors.length > 0 ? result.errors.join('; ') : null}
        )
      `;
    }
  } catch (err: any) {
    logger.error({ err, eventType }, 'Erro geral no despacho de gatilhos automáticos');
    result.errors.push(err?.message || String(err));
  }

  return result;
}

/**
 * Cria árvores de automação padrões no banco caso não existam
 */
export async function ensureDefaultTriggers(): Promise<void> {
  const defaultTriggers = [
    {
      code: 'trigger_pagamento_confirmado',
      name: 'Fluxo Padrão — Pagamento Confirmado',
      description: 'Dispara e-mail de apólice ativa quando o pagamento é aprovado via Asaas',
      event_type: 'PAGAMENTO_CONFIRMADO',
      tree_definition: {
        nos: [
          {
            id: 'root-pagamento',
            tipo: 'GATILHO',
            titulo: 'Pagamento Confirmado',
            subtitulo: 'Evento: PAGAMENTO_CONFIRMADO',
            parentId: null,
            ativo: true,
            posicaoX: 500,
            posicaoY: 60,
            configuracao: { gatilho_codigo: 'PAGAMENTO_CONFIRMADO' },
          },
          {
            id: 'action-email-cliente',
            tipo: 'ACAO_EMAIL',
            titulo: 'Enviar E-mail de Confirmação',
            subtitulo: 'Dispara template de pagamento aprovado',
            parentId: 'root-pagamento',
            ativo: true,
            posicaoX: 500,
            posicaoY: 220,
            configuracao: {
              template_id: 'pagamento_confirmado',
              destinatarios: [
                { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
              ],
            },
          },
        ],
      },
    },
    {
      code: 'trigger_contrato_assinado',
      name: 'Fluxo Padrão — Contrato Assinado ZapSign',
      description: 'Dispara confirmação de assinatura quando o contrato é assinado',
      event_type: 'CONTRATO_ASSINADO',
      tree_definition: {
        nos: [
          {
            id: 'root-contrato',
            tipo: 'GATILHO',
            titulo: 'Contrato Assinado',
            subtitulo: 'Evento: CONTRATO_ASSINADO',
            parentId: null,
            ativo: true,
            posicaoX: 500,
            posicaoY: 60,
            configuracao: { gatilho_codigo: 'CONTRATO_ASSINADO' },
          },
          {
            id: 'action-email-contrato',
            tipo: 'ACAO_EMAIL',
            titulo: 'Enviar Confirmação de Assinatura',
            subtitulo: 'Dispara template de contrato assinado',
            parentId: 'root-contrato',
            ativo: true,
            posicaoX: 500,
            posicaoY: 220,
            configuracao: {
              template_id: 'contrato_assinado',
              destinatarios: [
                { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
              ],
            },
          },
        ],
      },
    },
    {
      code: 'trigger_cotacao_gerada',
      name: 'Fluxo Padrão — Nova Cotação Gerada',
      description: 'Envia proposta detalhada para o cliente quando a cotação é criada',
      event_type: 'COTACAO_CRIADA',
      tree_definition: {
        nos: [
          {
            id: 'root-cotacao',
            tipo: 'GATILHO',
            titulo: 'Cotação Gerada',
            subtitulo: 'Evento: COTACAO_CRIADA',
            parentId: null,
            ativo: true,
            posicaoX: 500,
            posicaoY: 60,
            configuracao: { gatilho_codigo: 'COTACAO_CRIADA' },
          },
          {
            id: 'action-email-proposta',
            tipo: 'ACAO_EMAIL',
            titulo: 'Enviar Proposta ao Cliente',
            subtitulo: 'Dispara template de cotação com link',
            parentId: 'root-cotacao',
            ativo: true,
            posicaoX: 500,
            posicaoY: 220,
            configuracao: {
              template_id: 'cotacao_gerada',
              destinatarios: [
                { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
              ],
            },
          },
        ],
      },
    },
    {
      code: 'trigger_recuperar_senha',
      name: 'Fluxo Padrão — Recuperação de Senha',
      description: 'Dispara e-mail com link de redefinição de senha quando solicitado pelo usuário',
      event_type: 'RECUPERAR_SENHA',
      tree_definition: {
        nos: [
          {
            id: 'root-recuperar-senha',
            tipo: 'GATILHO',
            titulo: 'Solicitação de Reset de Senha',
            subtitulo: 'Evento: RECUPERAR_SENHA',
            parentId: null,
            ativo: true,
            posicaoX: 500,
            posicaoY: 60,
            configuracao: { gatilho_codigo: 'RECUPERAR_SENHA' },
          },
          {
            id: 'action-email-reset',
            tipo: 'ACAO_EMAIL',
            titulo: 'Enviar E-mail de Redefinição',
            subtitulo: 'Dispara template com o link seguro',
            parentId: 'root-recuperar-senha',
            ativo: true,
            posicaoX: 500,
            posicaoY: 220,
            configuracao: {
              template_id: 'recuperacao_senha',
              destinatarios: [
                { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
              ],
            },
          },
        ],
      },
    },
  ];

  for (const trig of defaultTriggers) {
    await sql`
      INSERT INTO automation_triggers (code, name, description, event_type, is_active, tree_definition)
      VALUES (
        ${trig.code},
        ${trig.name},
        ${trig.description},
        ${trig.event_type},
        true,
        ${sql.json(trig.tree_definition)}
      )
      ON CONFLICT (code) DO NOTHING
    `;
  }
}
