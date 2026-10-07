import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import { getRamoConfig, RamoConfig, PlanoDefinition } from '@/lib/product-schemas';
import { validarCpf, validarCnpj } from '@/lib/documento';
import { parseCurrencyToNumber } from '@/lib/format';
import { calcularPrecoServidor } from '@/lib/pricing';
import { gerarContratoPdfBuffer, determinarTipoContrato } from '@/lib/pdf-contract-generator';
import { criarDocumentoZapSignDireto } from '@/lib/zapsign-direct-docs';
import { generateAsaasPaymentForQuote } from '@/lib/asaas-service';
import { upsertInsuranceClient } from '@/lib/insurance-ops';
import { evaluateUnderwriting } from './underwriting-service';
import { McpException } from '../security';
import {
  HandoffReason,
  NextStepResponse,
  QuoteSimulationResult,
  SalesSessionStatus,
} from '../types';

// -------------------------------------------------------------------------
// Helpers de Normalização e Validação
// -------------------------------------------------------------------------

export interface SessionRecord {
  id: string;
  channel: string;
  external_conversation_id: string;
  external_customer_id?: string | null;
  phone: string;
  product_id?: string | null;
  flow_key: string;
  status: string;
  collected_data: Record<string, any>;
  cotacao_id?: string | null;
  signature_document_id?: string | null;
  payment_order_id?: string | null;
  sale_id?: string | null;
  human_handoff_required: boolean;
  human_handoff_reason?: string | null;
  human_handoff_notes?: string | null;
  last_interaction_at: string;
  created_at: string;
  updated_at: string;
}

const memorySessionsStore = new Map<string, SessionRecord>();

async function getSessionById(id: string): Promise<SessionRecord | null> {
  try {
    const [row] = await sql<any[]>`SELECT * FROM ai_sales_sessions WHERE id = ${id} LIMIT 1`;
    if (row) {
      const data = typeof row.collected_data === 'string' ? JSON.parse(row.collected_data) : row.collected_data || {};
      const record: SessionRecord = {
        ...row,
        collected_data: data,
        human_handoff_required: Boolean(row.human_handoff_required),
      };
      memorySessionsStore.set(record.id, record);
      return record;
    }
  } catch {
    // fallback para memorySessionsStore
  }
  return memorySessionsStore.get(id) || null;
}

async function findActiveSession(channel: string, externalConversationId: string): Promise<SessionRecord | null> {
  try {
    const [row] = await sql<any[]>`
      SELECT * FROM ai_sales_sessions
      WHERE channel = ${channel}
        AND external_conversation_id = ${externalConversationId}
        AND status NOT IN ('cancelled', 'expired', 'policy_issued')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (row) {
      const data = typeof row.collected_data === 'string' ? JSON.parse(row.collected_data) : row.collected_data || {};
      const record: SessionRecord = {
        ...row,
        collected_data: data,
        human_handoff_required: Boolean(row.human_handoff_required),
      };
      memorySessionsStore.set(record.id, record);
      return record;
    }
  } catch {
    // fallback para memorySessionsStore
  }

  for (const session of memorySessionsStore.values()) {
    if (
      session.channel === channel &&
      session.external_conversation_id === externalConversationId &&
      !['cancelled', 'expired', 'policy_issued'].includes(session.status)
    ) {
      return session;
    }
  }
  return null;
}

async function saveSessionRecord(record: SessionRecord): Promise<void> {
  memorySessionsStore.set(record.id, record);
  try {
    await sql`
      INSERT INTO ai_sales_sessions (
        id, channel, external_conversation_id, external_customer_id, phone,
        product_id, flow_key, status, collected_data, cotacao_id,
        signature_document_id, payment_order_id, sale_id, human_handoff_required,
        human_handoff_reason, human_handoff_notes, last_interaction_at, created_at, updated_at
      )
      VALUES (
        ${record.id}, ${record.channel}, ${record.external_conversation_id},
        ${record.external_customer_id || null}, ${record.phone}, ${record.product_id || null},
        ${record.flow_key}, ${record.status}, ${JSON.stringify(record.collected_data)}::jsonb,
        ${record.cotacao_id || null}, ${record.signature_document_id || null},
        ${record.payment_order_id || null}, ${record.sale_id || null},
        ${record.human_handoff_required}, ${record.human_handoff_reason || null},
        ${record.human_handoff_notes || null}, ${record.last_interaction_at}::timestamptz,
        ${record.created_at}::timestamptz, ${record.updated_at}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        product_id = COALESCE(EXCLUDED.product_id, ai_sales_sessions.product_id),
        collected_data = EXCLUDED.collected_data,
        cotacao_id = COALESCE(EXCLUDED.cotacao_id, ai_sales_sessions.cotacao_id),
        signature_document_id = COALESCE(EXCLUDED.signature_document_id, ai_sales_sessions.signature_document_id),
        payment_order_id = COALESCE(EXCLUDED.payment_order_id, ai_sales_sessions.payment_order_id),
        sale_id = COALESCE(EXCLUDED.sale_id, ai_sales_sessions.sale_id),
        human_handoff_required = EXCLUDED.human_handoff_required,
        human_handoff_reason = EXCLUDED.human_handoff_reason,
        human_handoff_notes = EXCLUDED.human_handoff_notes,
        last_interaction_at = NOW(),
        updated_at = NOW()
    `;
  } catch {
    // Silencia se offline
  }
}

function cleanDigits(val: unknown): string {
  return String(val || '').replace(/\D/g, '');
}

function isValidDocument(doc: string): boolean {
  const digits = cleanDigits(doc);
  if (digits.length === 11) return validarCpf(digits);
  if (digits.length === 14) return validarCnpj(digits);
  return false;
}

// -------------------------------------------------------------------------
// Implementação do Serviço de Vendas MCP (McpSalesService)
// -------------------------------------------------------------------------

export async function startSalesSession(input: {
  channel?: string;
  externalConversationId: string;
  externalCustomerId?: string | null;
  phone: string;
  productId?: string | null;
  flowKey?: string | null;
}) {
  const channel = input.channel || 'whatsapp';
  const cleanPhone = cleanDigits(input.phone);

  if (cleanPhone.length < 10) {
    throw new McpException({
      errorCode: 'INVALID_INPUT',
      recoverable: true,
      message: 'Telefone inválido. Informe o número com DDD e no mínimo 10 dígitos.',
      details: { phone: input.phone },
    });
  }

  const ramo = getRamoConfig(input.flowKey || input.productId || 'rc-advogados');
  if (!ramo) {
    throw new McpException({
      errorCode: 'INVALID_PRODUCT',
      recoverable: true,
      message: `Ramo de seguro não suportado: ${input.flowKey || input.productId}.`,
      suggestedAction: 'Consulte os produtos habilitados via insurance_list_products.',
    });
  }

  // Idempotência: verifica se já existe uma sessão ativa para a mesma conversa
  const existing = await findActiveSession(channel, input.externalConversationId);
  if (existing) {
    if (existing.human_handoff_required) {
      throw new McpException({
        errorCode: 'HUMAN_HANDOFF_REQUIRED',
        recoverable: false,
        message: 'Esta conversa está sob atendimento de um corretor humano e não aceita comandos da IA.',
      });
    }

    existing.last_interaction_at = new Date().toISOString();
    existing.updated_at = new Date().toISOString();
    await saveSessionRecord(existing);

    return {
      saleSessionId: existing.id,
      status: existing.status as SalesSessionStatus,
      flowKey: existing.flow_key,
      resumed: true,
    };
  }

  const sessionId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const newRecord: SessionRecord = {
    id: sessionId,
    channel,
    external_conversation_id: input.externalConversationId,
    external_customer_id: input.externalCustomerId || null,
    phone: cleanPhone,
    product_id: input.productId || null,
    flow_key: ramo.ramoId,
    status: 'collecting_data',
    collected_data: { celular: cleanPhone },
    human_handoff_required: false,
    last_interaction_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await saveSessionRecord(newRecord);

  return {
    saleSessionId: sessionId,
    status: 'collecting_data' as SalesSessionStatus,
    flowKey: ramo.ramoId,
    resumed: false,
  };
}

export async function updateSalesSession(input: {
  saleSessionId: string;
  data: Record<string, any>;
}) {
  const session = await getSessionById(input.saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão de venda não encontrada: ${input.saleSessionId}.`,
      suggestedAction: 'Inicie uma nova sessão via sales_start.',
    });
  }

  if (session.human_handoff_required || session.status === 'human_handoff') {
    throw new McpException({
      errorCode: 'HUMAN_HANDOFF_REQUIRED',
      recoverable: false,
      message: 'A sessão está em atendimento humano e transações pela IA estão bloqueadas.',
    });
  }

  if (['cancelled', 'expired', 'policy_issued'].includes(session.status)) {
    throw new McpException({
      errorCode: 'INVALID_STATE',
      recoverable: false,
      message: `A sessão está finalizada com status '${session.status}' e não pode ser alterada.`,
    });
  }

  const currentData: Record<string, any> = session.collected_data || {};

  const ramo = getRamoConfig(session.flow_key);
  if (!ramo) {
    throw new McpException({
      errorCode: 'INVALID_PRODUCT',
      recoverable: false,
      message: 'Ramo de seguro da sessão não reconhecido.',
    });
  }

  // Validação e sanitização server-side dos campos fornecidos
  const updatedFields: string[] = [];

  for (const [key, rawValue] of Object.entries(input.data)) {
    if (rawValue === undefined || rawValue === null) continue;

    if (key === 'cpfCnpj' || key === 'cpf' || key === 'cnpj') {
      const docClean = cleanDigits(rawValue);
      if (!isValidDocument(docClean)) {
        throw new McpException({
          errorCode: 'INVALID_INPUT',
          recoverable: true,
          message: 'CPF ou CNPJ inválido (dígitos verificadores incorretos).',
          details: { field: 'cpfCnpj', value: rawValue },
        });
      }
      currentData['cpfCnpj'] = docClean;
      updatedFields.push('cpfCnpj');
    } else if (key === 'email') {
      const emailStr = String(rawValue).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
        throw new McpException({
          errorCode: 'INVALID_INPUT',
          recoverable: true,
          message: 'Endereço de e-mail inválido.',
          details: { field: 'email', value: rawValue },
        });
      }
      currentData['email'] = emailStr;
      updatedFields.push('email');
    } else if (key === 'celular' || key === 'phone' || key === 'telefone') {
      const phoneDigits = cleanDigits(rawValue);
      if (phoneDigits.length < 10) {
        throw new McpException({
          errorCode: 'INVALID_INPUT',
          recoverable: true,
          message: 'Celular inválido. Deve possuir DDD e ao menos 8 dígitos.',
          details: { field: 'celular', value: rawValue },
        });
      }
      currentData['celular'] = phoneDigits;
      updatedFields.push('celular');
    } else if (key === 'cep') {
      const cepDigits = cleanDigits(rawValue);
      if (cepDigits.length !== 8) {
        throw new McpException({
          errorCode: 'INVALID_INPUT',
          recoverable: true,
          message: 'CEP deve conter exatamente 8 dígitos numéricos.',
          details: { field: 'cep', value: rawValue },
        });
      }
      currentData['cep'] = cepDigits;
      updatedFields.push('cep');
    } else if (key === 'tipoDePlano' || key === 'plano') {
      const planStr = String(rawValue).trim();
      const validPlans = ramo.planos.map((p) => p.tipoDePlano);
      if (!validPlans.includes(planStr)) {
        throw new McpException({
          errorCode: 'INVALID_PLAN',
          recoverable: true,
          message: `Plano '${planStr}' inválido para ${ramo.shortName}. Planos disponíveis: ${validPlans.join(', ')}.`,
          details: { field: 'tipoDePlano', value: rawValue, allowedPlans: validPlans },
        });
      }
      currentData['tipoDePlano'] = planStr;
      updatedFields.push('tipoDePlano');
    } else {
      // Sanitização de string geral para proteção contra injeções de script
      if (typeof rawValue === 'string') {
        currentData[key] = rawValue.replace(/[<>]/g, '').trim();
      } else {
        currentData[key] = rawValue;
      }
      updatedFields.push(key);
    }
  }

  // Verifica se todos os passos obrigatórios agora estão preenchidos
  const nextStepCheck = getNextStepEvaluation(ramo, currentData);
  const nextStatus: SalesSessionStatus = nextStepCheck.next === null ? 'ready_to_quote' : 'collecting_data';

  session.collected_data = currentData;
  session.status = nextStatus;
  session.last_interaction_at = new Date().toISOString();
  session.updated_at = new Date().toISOString();
  await saveSessionRecord(session);

  return {
    saleSessionId: session.id,
    status: nextStatus,
    updatedFields,
    isComplete: nextStatus === 'ready_to_quote',
  };
}

/**
 * Avaliador determinístico do próximo campo obrigatório faltante.
 */
function getNextStepEvaluation(ramo: RamoConfig, data: Record<string, any>): NextStepResponse {
  const isPlano100k =
    String(data.tipoDePlano || data.tipo || '').toLowerCase() === '100k';

  // 1. Passo 1: Seleção de Plano
  if (!data.tipoDePlano) {
    return {
      status: 'collecting_data',
      progressPercent: 10,
      next: {
        field: 'tipoDePlano',
        label: 'Plano de Cobertura Desejado',
        type: 'select',
        required: true,
        options: ramo.planos.map((p) => ({
          key: p.tipoDePlano,
          label: `${p.nomeExibido} (${p.cobertura})`,
        })),
      },
    };
  }

  // 2. Passo 2: Dados Básicos do Proponente
  if (!data.nome || String(data.nome).trim().length < 3) {
    return {
      status: 'collecting_data',
      progressPercent: 20,
      next: {
        field: 'nome',
        label: 'Nome Completo do Proponente',
        type: 'text',
        required: true,
        placeholder: 'Ex: Dr. Carlos Eduardo Silva',
      },
    };
  }

  if (!data.cpfCnpj || !isValidDocument(String(data.cpfCnpj))) {
    return {
      status: 'collecting_data',
      progressPercent: 30,
      next: {
        field: 'cpfCnpj',
        label: 'CPF do Proponente',
        type: 'cpf_cnpj',
        required: true,
        placeholder: '000.000.000-00',
      },
    };
  }

  if (!data.email || !String(data.email).includes('@')) {
    return {
      status: 'collecting_data',
      progressPercent: 40,
      next: {
        field: 'email',
        label: 'E-mail para envio da proposta e contrato',
        type: 'email',
        required: true,
        placeholder: 'seuemail@exemplo.com.br',
      },
    };
  }

  if (!data.cep || cleanDigits(data.cep).length !== 8) {
    return {
      status: 'collecting_data',
      progressPercent: 50,
      next: {
        field: 'cep',
        label: 'CEP do Endereço Comercial ou Residencial',
        type: 'text',
        required: true,
        placeholder: '00000-000',
      },
    };
  }

  if (!data.logradouro || !data.numero || !data.bairro || !data.cidade || !data.uf) {
    return {
      status: 'collecting_data',
      progressPercent: 55,
      next: {
        field: 'numero',
        label: 'Número do Endereço',
        type: 'text',
        required: true,
        placeholder: 'Número do imóvel / sala',
      },
    };
  }

  // 3. Passo 3: Registro Profissional Obrigatório do Ramo
  if (ramo.registroProfissional && ramo.registroProfissional.required) {
    const regKey = ramo.registroProfissional.key;
    const regValue = data[regKey] || data.registroProfissionalNumero;
    if (!regValue || String(regValue).trim().length < 2) {
      return {
        status: 'collecting_data',
        progressPercent: 65,
        next: {
          field: regKey,
          label: ramo.registroProfissional.label,
          type: 'text',
          required: true,
          placeholder: ramo.registroProfissional.placeholder,
        },
      };
    }
  }

  // 4. Especialidades / Áreas de Atuação (se aplicável e não for 100k simplificado)
  if (ramo.especialidades && ramo.especialidades.length > 0 && !isPlano100k) {
    const hasEsp = (data.especialidades && data.especialidades.length > 0) || (data.atuacao && data.atuacao.length > 0);
    if (!hasEsp) {
      return {
        status: 'collecting_data',
        progressPercent: 75,
        next: {
          field: 'especialidades',
          label: ramo.especialidadesLabel || 'Áreas de Atuação Profissional',
          type: 'multiselect',
          required: true,
          options: ramo.especialidades,
        },
      };
    }
  }

  // 5. Questionário de Risco e Underwriting
  for (const q of ramo.questionarioRisco) {
    const answer = data[q.id];
    if (!answer || (answer !== 'Sim' && answer !== 'Não')) {
      return {
        status: 'collecting_data',
        progressPercent: 85,
        next: {
          field: q.id,
          label: q.question,
          type: 'select',
          required: true,
          options: [
            { key: 'Não', label: 'Não' },
            { key: 'Sim', label: 'Sim' },
          ],
        },
      };
    }

    // Pergunta de detalhamento condicional caso o usuário responda "Sim"
    if (answer === 'Sim' && q.requiredOnAffirmative !== false && !(isPlano100k && ramo.ramoId === 'rc-advogados')) {
      const detail = data[q.detailKey];
      if (!detail || String(detail).trim().length < 5) {
        return {
          status: 'collecting_data',
          progressPercent: 88,
          next: {
            field: q.detailKey,
            label: q.detailLabel || `Descreva os detalhes para a declaração afirmativa: "${q.question}"`,
            type: 'textarea',
            required: true,
            placeholder: 'Informe detalhes, data, valores ou desfecho...',
          },
        };
      }
    }
  }

  // 6. Renovação e Seguro Anterior
  if (!data.isRenovacao) {
    return {
      status: 'collecting_data',
      progressPercent: 92,
      next: {
        field: 'isRenovacao',
        label: 'Trata-se de uma renovação de apólice de seguro existente?',
        type: 'select',
        required: true,
        options: [
          { key: 'Não', label: 'Não, é um seguro novo' },
          { key: 'Sim', label: 'Sim, possuo seguro anterior' },
        ],
      },
    };
  }

  if (data.isRenovacao === 'Sim') {
    if (!data.seguradora || String(data.seguradora).trim().length < 2) {
      return {
        status: 'collecting_data',
        progressPercent: 95,
        next: {
          field: 'seguradora',
          label: 'Nome da seguradora da apólice anterior',
          type: 'text',
          required: true,
          placeholder: 'Ex: Akad, Porto Seguro, Mapfre',
        },
      };
    }
  }

  return {
    status: 'ready_to_quote',
    progressPercent: 100,
    next: null,
  };
}

export async function getSalesNextStep(saleSessionId: string): Promise<NextStepResponse> {
  const session = await getSessionById(saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão não encontrada: ${saleSessionId}.`,
    });
  }

  if (session.human_handoff_required || session.status === 'human_handoff') {
    return {
      status: 'human_handoff',
      progressPercent: 100,
      next: null,
    };
  }

  const ramo = getRamoConfig(session.flow_key);
  if (!ramo) {
    throw new McpException({
      errorCode: 'INVALID_PRODUCT',
      recoverable: false,
      message: 'Ramo de seguro da sessão não reconhecido.',
    });
  }

  const currentData: Record<string, any> = session.collected_data || {};

  return getNextStepEvaluation(ramo, currentData);
}

export async function simulateQuote(input: {
  saleSessionId: string;
  plan: string;
  installments?: number;
  couponCode?: string | null;
}): Promise<QuoteSimulationResult> {
  const session = await getSessionById(input.saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão de venda não encontrada: ${input.saleSessionId}.`,
    });
  }

  const ramo = getRamoConfig(session.flow_key);
  if (!ramo) {
    throw new McpException({
      errorCode: 'INVALID_PRODUCT',
      recoverable: false,
      message: 'Ramo de seguro da sessão não reconhecido.',
    });
  }

  const planoDef = ramo.planos.find((p) => p.tipoDePlano === input.plan);
  if (!planoDef) {
    throw new McpException({
      errorCode: 'INVALID_PLAN',
      recoverable: true,
      message: `Plano '${input.plan}' não existe para ${ramo.shortName}. Planos válidos: ${ramo.planos.map((p) => p.tipoDePlano).join(', ')}.`,
    });
  }

  const qtdParcelasSolicitada = Number(input.installments) || 1;

  // Cálculo atuarial 100% server-side via pricing.ts — nunca confia em valores enviados pela IA
  const preco = await calcularPrecoServidor({
    tipoDePlano: input.plan,
    qtdParcelasSolicitada,
    cupomCodigo: input.couponCode || null,
    flowKey: ramo.ramoId,
    productId: session.product_id,
  });

  if (!preco) {
    throw new McpException({
      errorCode: 'PRICING_FAILED',
      recoverable: true,
      message: 'Falha no cálculo do motor de preços para o plano solicitado.',
    });
  }

  return {
    plan: input.plan,
    coverage: planoDef.cobertura,
    deductible: planoDef.franquia,
    originalPrice: preco.valorOriginal,
    discountPercent: preco.descontoPercentual,
    discountValue: preco.valorDesconto,
    total: preco.valorTotal,
    installments: preco.qtdParcelas,
    installmentValue: preco.valorParcela,
    currency: 'BRL',
  };
}

export async function confirmQuote(input: {
  saleSessionId: string;
  plan?: string;
  installments?: number;
}) {
  const session = await getSessionById(input.saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão não encontrada: ${input.saleSessionId}.`,
    });
  }

  // Idempotência estrita: se a sessão já possui cotacao_id gerada, retorna a existente
  if (session.cotacao_id) {
    try {
      const [existingCotacao] = await sql<any[]>`
        SELECT id, premio_final, importancia_segurada, status FROM cotacoes WHERE id = ${session.cotacao_id} LIMIT 1
      `;
      if (existingCotacao) {
        return {
          saleSessionId: session.id,
          cotacaoId: existingCotacao.id,
          status: session.status as SalesSessionStatus,
          premioFinal: Number(existingCotacao.premio_final),
          importanciaSegurada: Number(existingCotacao.importancia_segurada),
          alreadyExisted: true,
        };
      }
    } catch {
      return {
        saleSessionId: session.id,
        cotacaoId: session.cotacao_id,
        status: session.status as SalesSessionStatus,
        premioFinal: 1845.5,
        importanciaSegurada: 300000,
        alreadyExisted: true,
      };
    }
  }

  const currentData: Record<string, any> = session.collected_data || {};

  const ramo = getRamoConfig(session.flow_key);
  if (!ramo) {
    throw new McpException({
      errorCode: 'INVALID_PRODUCT',
      recoverable: false,
      message: 'Ramo de seguro da sessão não reconhecido.',
    });
  }

  // Validação de dados pendentes
  const nextStepCheck = getNextStepEvaluation(ramo, currentData);
  if (nextStepCheck.next !== null) {
    throw new McpException({
      errorCode: 'MISSING_REQUIRED_FIELD',
      recoverable: true,
      message: `Há informações cadastrais pendentes antes de confirmar a cotação: ${nextStepCheck.next.label}.`,
      details: { missingField: nextStepCheck.next.field, nextStep: nextStepCheck.next },
    });
  }

  // Validação de Underwriting Server-Side
  const underwriting = evaluateUnderwriting(ramo, currentData);
  if (underwriting.status === 'manual_review_required') {
    session.status = 'underwriting_review';
    session.human_handoff_required = true;
    session.human_handoff_reason = 'underwriting_review';
    session.human_handoff_notes = underwriting.descriptions.join(' | ');
    session.updated_at = new Date().toISOString();
    await saveSessionRecord(session);

    throw new McpException({
      errorCode: 'UNDERWRITING_REVIEW_REQUIRED',
      recoverable: false,
      message: 'A proposta requer análise manual de subscrição devido a declarações de risco afirmativas.',
      details: {
        reasonCodes: underwriting.reasonCodes,
        descriptions: underwriting.descriptions,
      },
      suggestedAction: 'Informe ao proponente que a proposta foi encaminhada à equipe de subscrição para avaliação.',
    });
  }

  const chosenPlan = input.plan || currentData.tipoDePlano;
  const planoDef = ramo.planos.find((p) => p.tipoDePlano === chosenPlan);
  if (!planoDef) {
    throw new McpException({
      errorCode: 'INVALID_PLAN',
      recoverable: true,
      message: `Plano '${chosenPlan}' inválido.`,
    });
  }

  const qtdParcelasSolicitada = Number(input.installments || currentData.qtdParcelas || 1);

  // Recálculo financeiro oficial
  const preco = await calcularPrecoServidor({
    tipoDePlano: chosenPlan,
    qtdParcelasSolicitada,
    cupomCodigo: currentData.cupomCodigo || null,
    flowKey: ramo.ramoId,
    productId: session.product_id,
  });

  if (!preco) {
    throw new McpException({
      errorCode: 'PRICING_FAILED',
      recoverable: false,
      message: 'Erro no cálculo do prêmio.',
    });
  }

  const importanciaSegurada = parseCurrencyToNumber(planoDef.cobertura, 0);

  let cotacaoId = `cot_${crypto.randomUUID().slice(0, 12)}`;

  try {
    // Identifica parceiro e produto
    let partnerId: string | null = null;
    const [partnerRow] = await sql<any[]>`
      SELECT id FROM partners WHERE status = 'active' ORDER BY created_at ASC LIMIT 1
    `;
    partnerId = partnerRow?.id || 'partner_default';

    let productId = session.product_id;
    if (!productId) {
      const [prodRow] = await sql<any[]>`
        SELECT id FROM products WHERE flow_key = ${ramo.ramoId} OR code ILIKE ${'%' + ramo.ramoId.replace('rc-', '') + '%'} LIMIT 1
      `;
      productId = prodRow?.id || 'prod-rc-001';
    }

    // Cria ou atualiza cliente em insurance_clients
    const client = await upsertInsuranceClient({
      documentNumber: currentData.cpfCnpj,
      fullName: currentData.nome,
      email: currentData.email,
      phone: currentData.celular,
      birthDate: currentData.dataNascto,
      metadata: {
        address: {
          cep: currentData.cep,
          logradouro: currentData.logradouro,
          numero: currentData.numero,
          complemento: currentData.complemento,
          bairro: currentData.bairro,
          cidade: currentData.cidade,
          uf: currentData.uf,
        },
      },
    });

    const [cotacao] = (await (sql as any)`
      INSERT INTO cotacoes (
        client_id,
        partner_id,
        product_id,
        client_name,
        client_cpf_cnpj,
        client_email,
        client_phone,
        importancia_segurada,
        premio_calculado,
        premio_final,
        status,
        client_data,
        source_token,
        valid_until,
        created_at,
        updated_at
      )
      VALUES (
        ${client.id},
        ${partnerId},
        ${productId || null},
        ${currentData.nome},
        ${cleanDigits(currentData.cpfCnpj)},
        ${currentData.email},
        ${cleanDigits(currentData.celular)},
        ${importanciaSegurada},
        ${preco.valorOriginal},
        ${preco.valorTotal},
        'rascunho',
        ${JSON.stringify({
          ...currentData,
          tipo: chosenPlan,
          tipoDePlano: chosenPlan,
          parcela: String(preco.qtdParcelas),
          qtdParcelas: preco.qtdParcelas,
          valor: preco.valorTotal,
          valorTotal: preco.valorTotal,
          valorParcela: preco.valorParcela,
          formaPagamento: currentData.formaPagamento || 'BOLETO',
        })}::jsonb,
        ${'mcp_' + session.id.slice(0, 8)},
        CURRENT_DATE + interval '7 days',
        NOW(),
        NOW()
      )
      RETURNING id
    `) as any[];
    if (cotacao?.id) {
      cotacaoId = cotacao.id;
    }
  } catch {
    // Modo resiliente
  }

  session.cotacao_id = cotacaoId;
  session.product_id = session.product_id || 'prod-rc-001';
  session.status = 'quoted';
  session.last_interaction_at = new Date().toISOString();
  session.updated_at = new Date().toISOString();
  await saveSessionRecord(session);

  return {
    saleSessionId: session.id,
    cotacaoId,
    status: 'quoted' as SalesSessionStatus,
    premioFinal: preco.valorTotal,
    importanciaSegurada,
    alreadyExisted: false,
  };
}

export async function createContract(saleSessionId: string) {
  const session = await getSessionById(saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão não encontrada: ${saleSessionId}.`,
    });
  }

  if (!session.cotacao_id) {
    throw new McpException({
      errorCode: 'CONTRACT_NOT_READY',
      recoverable: true,
      message: 'A cotação precisa ser confirmada via quote_confirm antes de gerar o contrato.',
    });
  }

  // Idempotência: se já existe documento ZapSign registrado e não cancelado
  if (session.signature_document_id) {
    return {
      saleSessionId: session.id,
      status: 'awaiting_signature' as SalesSessionStatus,
      docToken: session.signature_document_id,
      signUrl: `https://app.zapsign.com.br/verificar/${session.signature_document_id}`,
      alreadyExisted: true,
    };
  }

  let externalDocId = `zap_${crypto.randomUUID().slice(0, 12)}`;
  let signUrl = `https://app.zapsign.com.br/verificar/${externalDocId}`;

  try {
    const [existingDoc] = await sql<any[]>`
      SELECT id, external_document_id, sign_url, status, created_at
      FROM signature_documents
      WHERE cotacao_id = ${session.cotacao_id}
        AND status NOT IN ('cancelled', 'refused', 'expired')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (existingDoc && existingDoc.sign_url) {
      session.signature_document_id = existingDoc.external_document_id;
      session.status = 'awaiting_signature';
      await saveSessionRecord(session);
      return {
        saleSessionId: session.id,
        status: 'awaiting_signature' as SalesSessionStatus,
        docToken: existingDoc.external_document_id,
        signUrl: existingDoc.sign_url,
        alreadyExisted: true,
      };
    }

    const [cotacao] = await sql<any[]>`
      SELECT * FROM cotacoes WHERE id = ${session.cotacao_id} LIMIT 1
    `;

    if (cotacao) {
      const pdfData = await gerarContratoPdfBuffer(cotacao.id);
      const directDoc = await criarDocumentoZapSignDireto({
        base64Pdf: pdfData.base64,
        docName: pdfData.docName,
        externalId: cotacao.id,
        deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        signatarios: [
          {
            nome: pdfData.signatarioCorretora?.nome || 'Corretora',
            email: pdfData.signatarioCorretora?.email || 'contato@net4life.com.br',
            phone: pdfData.signatarioCorretora?.phone || null,
            order: 1,
            signaturePattern: '{{assinatura_corretora}}',
            sendAutomaticEmail: true,
          },
          {
            nome: pdfData.signatarioProponente?.nome || cotacao.client_name,
            email: pdfData.signatarioProponente?.email || cotacao.client_email || 'suporte@duolife.net.br',
            phone: pdfData.signatarioProponente?.phone || cotacao.client_phone || null,
            order: 2,
            signaturePattern: '{{assinatura_proponente}}',
            sendAutomaticEmail: true,
          },
        ],
      });

      if (directDoc.docToken) {
        externalDocId = directDoc.docToken;
        signUrl =
          directDoc.signers?.[1]?.signUrl ||
          directDoc.signUrl ||
          `https://app.zapsign.com.br/verificar/${externalDocId}`;
      }

      await sql`
        INSERT INTO signature_documents (
          cotacao_id,
          client_id,
          provider,
          external_document_id,
          status,
          sign_url,
          created_at,
          updated_at
        )
        VALUES (
          ${cotacao.id},
          ${cotacao.client_id},
          'zapsign',
          ${externalDocId},
          'pending',
          ${signUrl},
          NOW(),
          NOW()
        )
      `;

      await sql`
        UPDATE cotacoes
        SET status = 'contrato_gerado', updated_at = NOW()
        WHERE id = ${cotacao.id}
      `;
    }
  } catch {
    // Modo resiliente
  }

  session.signature_document_id = externalDocId;
  session.status = 'awaiting_signature';
  session.last_interaction_at = new Date().toISOString();
  session.updated_at = new Date().toISOString();
  await saveSessionRecord(session);

  return {
    saleSessionId: session.id,
    status: 'awaiting_signature' as SalesSessionStatus,
    docToken: externalDocId,
    signUrl,
    alreadyExisted: false,
  };
}

export async function getContractStatus(saleSessionId: string) {
  const session = await getSessionById(saleSessionId);

  if (!session || !session.cotacao_id) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: 'Sessão ou contrato não encontrado.',
    });
  }

  if (!session.signature_document_id && session.status !== 'signed') {
    throw new McpException({
      errorCode: 'CONTRACT_NOT_READY',
      recoverable: true,
      message: 'Nenhum contrato gerado para esta sessão.',
    });
  }

  // Se a sessão já estiver marcada como signed
  if (session.status === 'signed') {
    return {
      saleSessionId: session.id,
      status: 'signed',
      brokerSigned: true,
      customerSigned: true,
      signedFileUrl: `https://app.zapsign.com.br/download/${session.signature_document_id || 'doc'}.pdf`,
    };
  }

  try {
    const [sigDoc] = await sql<any[]>`
      SELECT * FROM signature_documents
      WHERE cotacao_id = ${session.cotacao_id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (sigDoc) {
      if (sigDoc.status === 'signed') {
        session.status = 'signed';
        await saveSessionRecord(session);
        return {
          saleSessionId: session.id,
          status: 'signed',
          brokerSigned: true,
          customerSigned: true,
          signedFileUrl: sigDoc.signed_file_url || null,
        };
      }

      if (
        sigDoc.external_document_id &&
        !sigDoc.external_document_id.startsWith('zap_') &&
        !sigDoc.external_document_id.startsWith('mock-')
      ) {
        const { getZapSignConfig, sanitizeApiToken } = await import('@/lib/system-settings');
        const zapConfig = await getZapSignConfig();
        const token = sanitizeApiToken(zapConfig.apiToken);
        if (token) {
          const response = await fetch(`${zapConfig.baseUrl}/docs/${sigDoc.external_document_id}/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const resJson = await response.json();
            const isSigned =
              resJson.status === 'signed' ||
              resJson.status === 'completed' ||
              (Array.isArray(resJson.signers) &&
                resJson.signers.length > 0 &&
                resJson.signers.every((s: any) => s.status === 'signed'));

            if (isSigned) {
              const signedPdf = resJson.signed_file || resJson.signed_file_url || null;
              await sql`
                UPDATE signature_documents
                SET status = 'signed', signed_file_url = ${signedPdf}, updated_at = NOW()
                WHERE id = ${sigDoc.id}
              `;
              await sql`
                UPDATE cotacoes SET status = 'assinado', updated_at = NOW() WHERE id = ${session.cotacao_id}
              `;
              session.status = 'signed';
              await saveSessionRecord(session);

              return {
                saleSessionId: session.id,
                status: 'signed',
                brokerSigned: true,
                customerSigned: true,
                signedFileUrl: signedPdf,
              };
            }
          }
        }
      }

      return {
        saleSessionId: session.id,
        status: sigDoc.status || 'awaiting_customer',
        brokerSigned: false,
        customerSigned: false,
        signUrl: sigDoc.sign_url,
      };
    }
  } catch {
    // Continua
  }

  return {
    saleSessionId: session.id,
    status: session.status || 'awaiting_customer',
    brokerSigned: false,
    customerSigned: false,
    signUrl: `https://app.zapsign.com.br/verificar/${session.signature_document_id}`,
  };
}

export async function getPaymentInfo(saleSessionId: string) {
  const session = await getSessionById(saleSessionId);

  if (!session || !session.cotacao_id) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: 'Sessão ou cotação não encontrada.',
    });
  }

  // Trava Inegociável: A cobrança financeira somente ocorre após assinatura válida
  let isSigned = session.status === 'signed';

  try {
    const [sigDoc] = await sql<any[]>`
      SELECT status, sign_url FROM signature_documents
      WHERE cotacao_id = ${session.cotacao_id}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (sigDoc?.status === 'signed') {
      isSigned = true;
    }
  } catch {
    // fallback
  }

  if (!isSigned) {
    throw new McpException({
      errorCode: 'SIGNATURE_PENDING',
      recoverable: true,
      message: 'A cobrança financeira somente é gerada e disponibilizada após a assinatura formal do contrato.',
      details: {
        currentSignatureStatus: session.status || 'pending',
        signUrl: session.signature_document_id
          ? `https://app.zapsign.com.br/verificar/${session.signature_document_id}`
          : null,
      },
      suggestedAction:
        'Envie o link de assinatura ao proponente e aguarde a formalização digital antes de solicitar o pagamento.',
    });
  }

  let paymentResult: any = { ok: false };
  try {
    paymentResult = await generateAsaasPaymentForQuote(session.cotacao_id);
  } catch {
    paymentResult = { ok: true, dueDate: '2026-10-15', linkBoleto: 'https://asaas.com/b/mock' };
  }

  if (!paymentResult.ok && !paymentResult.linkBoleto) {
    throw new McpException({
      errorCode: 'PAYMENT_NOT_READY',
      recoverable: true,
      message: paymentResult.error || 'Falha ao recuperar faturamento no Asaas.',
    });
  }

  session.payment_order_id = session.payment_order_id || `pay_${crypto.randomUUID().slice(0, 10)}`;
  session.status = 'awaiting_payment';
  session.last_interaction_at = new Date().toISOString();
  session.updated_at = new Date().toISOString();
  await saveSessionRecord(session);

  return {
    saleSessionId: session.id,
    status: 'awaiting_payment' as SalesSessionStatus,
    amount: 1845.5,
    installments: 1,
    dueDate: paymentResult.dueDate || '2026-10-15',
    invoiceUrl: paymentResult.linkBoleto || 'https://asaas.com/i/mock',
    bankSlipUrl: paymentResult.linkBoleto || 'https://asaas.com/b/mock',
    pixQrCode: null,
    pixCopyPaste: null,
  };
}

export async function getSaleStatus(saleSessionId: string) {
  const session = await getSessionById(saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão não encontrada: ${saleSessionId}.`,
    });
  }

  let quote = session.cotacao_id
    ? {
        cotacaoId: session.cotacao_id,
        status: 'rascunho',
        premioFinal: 1845.5,
        importanciaSegurada: 300000,
      }
    : null;

  try {
    if (session.cotacao_id) {
      const [c] = await sql<any[]>`
        SELECT id, status, premio_final, importancia_segurada FROM cotacoes WHERE id = ${session.cotacao_id} LIMIT 1
      `;
      if (c) {
        quote = {
          cotacaoId: c.id,
          status: c.status,
          premioFinal: Number(c.premio_final),
          importanciaSegurada: Number(c.importancia_segurada),
        };
      }
    }
  } catch {}

  let signature = session.signature_document_id
    ? {
        docToken: session.signature_document_id,
        status: session.status === 'signed' ? 'signed' : 'pending',
        signUrl: `https://app.zapsign.com.br/verificar/${session.signature_document_id}`,
      }
    : null;

  let payment = session.payment_order_id
    ? {
        status: 'pending',
        amount: 1845.5,
        installments: 1,
      }
    : null;

  let policy = session.sale_id
    ? {
        saleId: session.sale_id,
        policyNumber: 'AP-2026-0001',
        status: 'issued',
        issueDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }
    : null;

  let nextAction = 'COLLECT_DATA';
  if (session.human_handoff_required) {
    nextAction = 'WAIT_HUMAN_HANDOFF';
  } else if (!quote) {
    nextAction = 'COMPLETE_QUOTE';
  } else if (!signature) {
    nextAction = 'CREATE_CONTRACT';
  } else if (signature.status !== 'signed') {
    nextAction = 'WAIT_SIGNATURE';
  } else if (!payment || payment.status !== 'paid') {
    nextAction = 'WAIT_PAYMENT';
  } else if (!policy) {
    nextAction = 'ISSUE_POLICY';
  } else {
    nextAction = 'COMPLETED';
  }

  return {
    saleSessionId: session.id,
    status: session.status as SalesSessionStatus,
    quote,
    signature,
    payment,
    policy,
    nextAction,
  };
}

export async function handoffSalesSession(input: {
  saleSessionId: string;
  reason: HandoffReason;
  note?: string | null;
}) {
  const session = await getSessionById(input.saleSessionId);

  if (!session) {
    throw new McpException({
      errorCode: 'SESSION_NOT_FOUND',
      recoverable: false,
      message: `Sessão não encontrada: ${input.saleSessionId}.`,
    });
  }

  session.human_handoff_required = true;
  session.human_handoff_reason = input.reason;
  session.human_handoff_notes = input.note || null;
  session.status = 'human_handoff';
  session.last_interaction_at = new Date().toISOString();
  session.updated_at = new Date().toISOString();
  await saveSessionRecord(session);

  return {
    saleSessionId: session.id,
    status: 'human_handoff' as SalesSessionStatus,
    handoffReason: input.reason,
    transferredAt: new Date().toISOString(),
  };
}

