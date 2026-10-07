import {
  McpClientAuthContext,
  McpErrorCode,
  McpJsonRpcError,
  McpJsonRpcResponse,
  McpScope,
} from './types';
import {
  checkMcpRateLimit,
  checkMcpScope,
  McpException,
  verifyMcpApiKey,
} from './security';
import { recordMcpAuditLog } from './audit';
import { listMcpProducts, getMcpProductDetail } from './services/product-service';
import {
  confirmQuote,
  createContract,
  getContractStatus,
  getPaymentInfo,
  getSalesNextStep,
  getSaleStatus,
  handoffSalesSession,
  simulateQuote,
  startSalesSession,
  updateSalesSession,
} from './services/sales-service';

// -------------------------------------------------------------------------
// Definições de Ferramentas (MCP Tools Schema)
// -------------------------------------------------------------------------

export const MCP_TOOLS_DEFINITIONS = [
  {
    name: 'insurance_list_products',
    description: 'Retorna a lista de produtos securitários (RC Profissional) homologados e habilitados para venda assistida por IA.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    requiredScope: 'insurance:catalog:read' as McpScope,
  },
  {
    name: 'insurance_get_product',
    description: 'Retorna detalhes completos de um produto ou ramo de seguro, incluindo coberturas, planos, franquias, parcelamento e questionário de risco.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'ID do produto no banco (ex: prod-rc-001)' },
        flowKey: { type: 'string', description: 'Chave do fluxo do ramo (ex: rc-advogados, rc-medicos)' },
      },
      required: [],
    },
    requiredScope: 'insurance:catalog:read' as McpScope,
  },
  {
    name: 'sales_start',
    description: 'Inicia ou recupera uma sessão de venda assistida por IA para um proponente em um canal (ex: WhatsApp).',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Canal de atendimento (padrão: whatsapp)' },
        externalConversationId: { type: 'string', description: 'ID da conversa no canal externo' },
        externalCustomerId: { type: 'string', description: 'ID do cliente no CRM ou provedor' },
        phone: { type: 'string', description: 'Número de telefone do proponente com DDD' },
        flowKey: { type: 'string', description: 'Ramo de seguro desejado (ex: rc-advogados)' },
        productId: { type: 'string', description: 'ID do produto no catálogo' },
      },
      required: ['externalConversationId', 'phone'],
    },
    requiredScope: 'insurance:sale:create' as McpScope,
  },
  {
    name: 'sales_update',
    description: 'Atualiza dados cadastrais, atuariais ou respostas declarativas coletadas na conversa.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial retornada por sales_start' },
        data: { type: 'object', description: 'Pares de chave/valor com os dados informados pelo proponente' },
      },
      required: ['saleSessionId', 'data'],
    },
    requiredScope: 'insurance:sale:create' as McpScope,
  },
  {
    name: 'sales_next_step',
    description: 'Avalia deterministicamente no backend qual campo ou pergunta ainda precisa ser formulada ao proponente.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
      },
      required: ['saleSessionId'],
    },
    requiredScope: 'insurance:sale:read' as McpScope,
  },
  {
    name: 'quote_simulate',
    description: 'Calcula a simulação financeira oficial do seguro utilizando o motor de precificação do backend.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
        plan: { type: 'string', description: 'Tipo do plano selecionado (ex: 100k, 300k, 500k)' },
        installments: { type: 'integer', description: 'Quantidade de parcelas desejada (1 a 6)' },
        couponCode: { type: 'string', description: 'Código de cupom promocional opcional' },
      },
      required: ['saleSessionId', 'plan'],
    },
    requiredScope: 'insurance:quote' as McpScope,
  },
  {
    name: 'quote_confirm',
    description: 'Transforma a proposta da sessão em uma cotação oficial no sistema após validar 100% dos requisitos.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
        plan: { type: 'string', description: 'Tipo do plano a confirmar (opcional se já selecionado)' },
        installments: { type: 'integer', description: 'Quantidade de parcelas (opcional se já selecionado)' },
      },
      required: ['saleSessionId'],
    },
    requiredScope: 'insurance:quote' as McpScope,
  },
  {
    name: 'contract_create',
    description: 'Gera a minuta contratual em PDF com âncoras e registra o envelope no ZapSign com dupla assinatura sequencial.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
      },
      required: ['saleSessionId'],
    },
    requiredScope: 'insurance:contract:create' as McpScope,
  },
  {
    name: 'contract_status',
    description: 'Consulta o status de assinatura do contrato no ZapSign e no banco local.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
      },
      required: ['saleSessionId'],
    },
    requiredScope: 'insurance:sale:read' as McpScope,
  },
  {
    name: 'payment_get',
    description: 'Retorna as informações de faturamento e pagamento (PIX QR Code, Copia e Cola e Boleto) após a assinatura formal.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
      },
      required: ['saleSessionId'],
    },
    requiredScope: 'insurance:payment:read' as McpScope,
  },
  {
    name: 'sale_status',
    description: 'Fornece uma visão normalizada e completa do progresso da venda (cotação, minuta, faturamento e apólice).',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
      },
      required: ['saleSessionId'],
    },
    requiredScope: 'insurance:sale:read' as McpScope,
  },
  {
    name: 'sales_handoff',
    description: 'Transfere a condução do atendimento para um operador humano e suspende ações transacionais da IA.',
    inputSchema: {
      type: 'object',
      properties: {
        saleSessionId: { type: 'string', description: 'ID da sessão comercial' },
        reason: {
          type: 'string',
          enum: [
            'underwriting_review',
            'customer_requested',
            'inconsistent_data',
            'unsupported_product',
            'system_error',
            'compliance_review',
            'unusual_request',
          ],
          description: 'Motivo padronizado do transbordo',
        },
        note: { type: 'string', description: 'Observações contextuais para o corretor' },
      },
      required: ['saleSessionId', 'reason'],
    },
    requiredScope: 'insurance:sale:create' as McpScope,
  },
];

// -------------------------------------------------------------------------
// Roteador e Despachante Principal MCP
// -------------------------------------------------------------------------

export async function handleMcpProtocolRequest(
  payload: any,
  authHeader: string | null,
  clientIp = 'unknown'
): Promise<{ statusCode: number; response: McpJsonRpcResponse }> {
  const startMs = Date.now();
  const requestId = payload?.id !== undefined ? String(payload.id) : crypto.randomUUID();
  const method = payload?.method || '';

  // 1. Handshake Inicial (Initialize e Notifications)
  if (method === 'initialize') {
    return {
      statusCode: 200,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'duolife-mcp-server',
            version: '1.0.0',
          },
        },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return {
      statusCode: 200,
      response: { jsonrpc: '2.0', id: payload.id ?? null, result: {} },
    };
  }

  // 2. Autenticação Server-to-Server
  const authContext = await verifyMcpApiKey(authHeader);
  if (!authContext) {
    const errorJson: McpJsonRpcError = {
      code: -32001,
      message: 'Chave de autenticação MCP inválida, revogada ou ausente.',
      data: {
        errorCode: 'UNAUTHORIZED',
        recoverable: false,
        message: 'Acesso não autorizado à camada MCP.',
      },
    };

    return {
      statusCode: 401,
      response: { jsonrpc: '2.0', id: payload.id ?? null, error: errorJson },
    };
  }

  // 3. Verificação de Limite de Taxa (Rate Limit)
  const rl = checkMcpRateLimit(authContext.clientId, authContext.rateLimitPerMinute);
  if (!rl.ok) {
    const errorJson: McpJsonRpcError = {
      code: -32000,
      message: `Limite de requisições excedido. Tente novamente em ${rl.retryAfterSeconds} segundos.`,
      data: {
        errorCode: 'RATE_LIMITED',
        recoverable: true,
        message: 'Taxa máxima de requisições por minuto atingida.',
        details: { retryAfterSeconds: rl.retryAfterSeconds },
        suggestedAction: `Aguarde ${rl.retryAfterSeconds} segundos antes de reenviar a requisição.`,
      },
    };

    return {
      statusCode: 429,
      response: { jsonrpc: '2.0', id: payload.id ?? null, error: errorJson },
    };
  }

  // 4. Tratamento do Método tools/list
  if (method === 'tools/list') {
    return {
      statusCode: 200,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        result: {
          tools: MCP_TOOLS_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      },
    };
  }

  // 5. Execução de Tools (tools/call ou chamada direta com method = nome da tool)
  let toolName = '';
  let toolArgs: Record<string, any> = {};

  if (method === 'tools/call') {
    toolName = String(payload.params?.name || '');
    toolArgs = payload.params?.arguments || {};
  } else if (MCP_TOOLS_DEFINITIONS.some((t) => t.name === method)) {
    toolName = method;
    toolArgs = payload.params || {};
  } else {
    return {
      statusCode: 400,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: {
          code: -32601,
          message: `Método ou tool não reconhecida: '${method}'.`,
          data: {
            errorCode: 'INVALID_INPUT',
            recoverable: false,
            message: 'O método JSON-RPC informado não é suportado pelo servidor DuoLife.',
          },
        },
      },
    };
  }

  const toolDef = MCP_TOOLS_DEFINITIONS.find((t) => t.name === toolName);
  if (!toolDef) {
    return {
      statusCode: 404,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: {
          code: -32601,
          message: `Tool '${toolName}' não encontrada.`,
          data: {
            errorCode: 'INVALID_INPUT',
            recoverable: false,
            message: 'Tool não catalogada.',
          },
        },
      },
    };
  }

  // Validação do Escopo Granular da Tool
  if (!checkMcpScope(authContext, toolDef.requiredScope)) {
    return {
      statusCode: 403,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: {
          code: -32003,
          message: `Permissão insuficiente. Escopo necessário: ${toolDef.requiredScope}.`,
          data: {
            errorCode: 'FORBIDDEN',
            recoverable: false,
            message: 'A chave utilizada não possui escopo suficiente para esta ferramenta.',
            details: {
              requiredScope: toolDef.requiredScope,
              clientScopes: authContext.scopes,
            },
          },
        },
      },
    };
  }

  // 6. Despacho da Tool para os Serviços de Aplicação
  try {
    let result: unknown = null;

    switch (toolName) {
      case 'insurance_list_products':
        result = { products: await listMcpProducts() };
        break;

      case 'insurance_get_product':
        result = await getMcpProductDetail(toolArgs);
        break;

      case 'sales_start':
        result = await startSalesSession({
          channel: toolArgs.channel,
          externalConversationId: String(toolArgs.externalConversationId || ''),
          externalCustomerId: toolArgs.externalCustomerId,
          phone: String(toolArgs.phone || ''),
          flowKey: toolArgs.flowKey,
          productId: toolArgs.productId,
        });
        break;

      case 'sales_update':
        result = await updateSalesSession({
          saleSessionId: String(toolArgs.saleSessionId || ''),
          data: toolArgs.data || {},
        });
        break;

      case 'sales_next_step':
        result = await getSalesNextStep(String(toolArgs.saleSessionId || ''));
        break;

      case 'quote_simulate':
        result = await simulateQuote({
          saleSessionId: String(toolArgs.saleSessionId || ''),
          plan: String(toolArgs.plan || ''),
          installments: toolArgs.installments ? Number(toolArgs.installments) : undefined,
          couponCode: toolArgs.couponCode,
        });
        break;

      case 'quote_confirm':
        result = await confirmQuote({
          saleSessionId: String(toolArgs.saleSessionId || ''),
          plan: toolArgs.plan,
          installments: toolArgs.installments ? Number(toolArgs.installments) : undefined,
        });
        break;

      case 'contract_create':
        result = await createContract(String(toolArgs.saleSessionId || ''));
        break;

      case 'contract_status':
        result = await getContractStatus(String(toolArgs.saleSessionId || ''));
        break;

      case 'payment_get':
        result = await getPaymentInfo(String(toolArgs.saleSessionId || ''));
        break;

      case 'sale_status':
        result = await getSaleStatus(String(toolArgs.saleSessionId || ''));
        break;

      case 'sales_handoff':
        result = await handoffSalesSession({
          saleSessionId: String(toolArgs.saleSessionId || ''),
          reason: toolArgs.reason,
          note: toolArgs.note,
        });
        break;

      default:
        throw new McpException({
          errorCode: 'INVALID_INPUT',
          recoverable: false,
          message: `Tool não implementada: ${toolName}`,
        });
    }

    const durationMs = Date.now() - startMs;

    // Auditoria assíncrona com mascaramento LGPD
    recordMcpAuditLog({
      requestId,
      clientId: authContext.clientId,
      tool: toolName,
      saleSessionId: toolArgs.saleSessionId || null,
      resultStatus: 'success',
      durationMs,
      inputRaw: toolArgs,
      outputRaw: result,
    }).catch(() => {});

    return {
      statusCode: 200,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        result: method === 'tools/call' ? { content: [{ type: 'text', text: JSON.stringify(result) }], structured: result } : result,
      },
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const isMcpEx = err instanceof McpException;

    const errorCode: McpErrorCode = isMcpEx ? err.payload.errorCode : 'INTERNAL_ERROR';
    const message = isMcpEx ? err.payload.message : 'Erro interno ao processar a operação.';
    const details = isMcpEx ? err.payload.details : null;
    const recoverable = isMcpEx ? err.payload.recoverable : false;
    const suggestedAction = isMcpEx ? err.payload.suggestedAction : undefined;
    const httpStatus = isMcpEx ? err.httpStatus : 500;

    const errorJson: McpJsonRpcError = {
      code: -32000,
      message,
      data: {
        errorCode,
        recoverable,
        message,
        details,
        suggestedAction,
      },
    };

    // Auditoria assíncrona da falha
    recordMcpAuditLog({
      requestId,
      clientId: authContext.clientId,
      tool: toolName,
      saleSessionId: toolArgs.saleSessionId || null,
      resultStatus: 'error',
      errorCode,
      durationMs,
      inputRaw: toolArgs,
      outputRaw: errorJson,
    }).catch(() => {});

    return {
      statusCode: httpStatus,
      response: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: errorJson,
      },
    };
  }
}
