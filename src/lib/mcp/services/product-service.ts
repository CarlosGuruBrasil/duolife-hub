import { sql } from '@/lib/pg';
import { getRamoConfig, RAMOS_REGISTRY } from '@/lib/product-schemas';
import { parseCurrencyToNumber } from '@/lib/format';
import { McpException } from '../security';

export interface McpProductSummary {
  productId: string;
  flowKey: string;
  name: string;
  shortName: string;
  targetAudience: string;
  available: boolean;
}

export interface McpProductDetail {
  productId: string;
  flowKey: string;
  name: string;
  shortName: string;
  category: string;
  targetAudience: string;
  policyPrefix: string;
  maxInstallments: number;
  hasUnderwriting: boolean;
  registroProfissional?: {
    key: string;
    label: string;
    placeholder: string;
    required: boolean;
  };
  planos: Array<{
    tipoDePlano: string;
    nome: string;
    cobertura: string;
    franquia: string;
    maxParcelas: number;
    valorBase: number;
  }>;
  especialidadesLabel?: string;
  especialidades?: Array<{ key: string; label: string }>;
  questionarioRisco: Array<{
    id: string;
    question: string;
    detailKey: string;
    detailLabel?: string;
  }>;
}

/**
 * Retorna os produtos securitários de Responsabilidade Civil homologados para a IA.
 */
export async function listMcpProducts(): Promise<McpProductSummary[]> {
  // 1. Busca produtos ativos no banco de dados
  let dbProducts: any[] = [];
  try {
    dbProducts = await sql`
      SELECT id, name, code, flow_key, is_active
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
    `;
  } catch {
    dbProducts = [];
  }

  // 2. Mapeia os 5 ramos de RC homologados garantindo que o catálogo declarativo seja a autoridade
  const registeredRamos = Object.values(RAMOS_REGISTRY).filter((r) => r.ramoId !== 'do-executivos');

  const result: McpProductSummary[] = [];

  for (const ramo of registeredRamos) {
    const matchedDb = dbProducts.find((p) => {
      const pFlow = String(p.flow_key || '').toLowerCase();
      const pCode = String(p.code || '').toLowerCase();
      return (
        pFlow === ramo.ramoId ||
        ramo.flowKeys.map((fk) => fk.toLowerCase()).includes(pFlow) ||
        pCode.includes(ramo.ramoId.replace('rc-', ''))
      );
    });

    const productId = matchedDb ? matchedDb.id : `prod-${ramo.ramoId}`;

    result.push({
      productId,
      flowKey: ramo.ramoId,
      name: matchedDb ? matchedDb.name : ramo.name,
      shortName: ramo.shortName,
      targetAudience: ramo.targetAudience,
      available: true,
    });
  }

  return result;
}

/**
 * Retorna a ficha técnica detalhada de um produto/ramo derivado de product-schemas.
 */
export async function getMcpProductDetail(input: {
  productId?: string | null;
  flowKey?: string | null;
}): Promise<McpProductDetail> {
  let resolvedKey = input.flowKey || null;

  if (!resolvedKey && input.productId) {
    try {
      const [prod] = await sql`
        SELECT flow_key, code, category FROM products WHERE id = ${input.productId} LIMIT 1
      `;
      if (prod) {
        resolvedKey = prod.flow_key || prod.code;
      }
    } catch {
      // continua com fallback
    }
  }

  const ramo = getRamoConfig(resolvedKey || input.productId || 'rc-advogados');

  if (!ramo) {
    throw new McpException({
      errorCode: 'INVALID_PRODUCT',
      recoverable: true,
      message: `Produto ou ramo de seguro não encontrado: ${resolvedKey || input.productId || 'não informado'}.`,
      suggestedAction: 'Utilize a tool insurance_list_products para consultar os produtos disponíveis.',
    });
  }

  return {
    productId: input.productId || `prod-${ramo.ramoId}`,
    flowKey: ramo.ramoId,
    name: ramo.name,
    shortName: ramo.shortName,
    category: ramo.category,
    targetAudience: ramo.targetAudience,
    policyPrefix: ramo.policyPrefix,
    maxInstallments: 6,
    hasUnderwriting: ramo.requiresUnderwriting ?? true,
    registroProfissional: ramo.registroProfissional
      ? {
          key: ramo.registroProfissional.key,
          label: ramo.registroProfissional.label,
          placeholder: ramo.registroProfissional.placeholder,
          required: ramo.registroProfissional.required ?? true,
        }
      : undefined,
    planos: ramo.planos.map((p) => {
      const valorBase = parseCurrencyToNumber(p.parcela, 0);
      const maxParcelas =
        p.maxParcelas != null ? p.maxParcelas : p.tipoDePlano === '100k' ? 1 : 6;
      return {
        tipoDePlano: p.tipoDePlano,
        nome: p.nomeExibido,
        cobertura: p.cobertura,
        franquia: p.franquia,
        maxParcelas,
        valorBase,
      };
    }),
    especialidadesLabel: ramo.especialidadesLabel,
    especialidades: ramo.especialidades,
    questionarioRisco: ramo.questionarioRisco.map((q) => ({
      id: q.id,
      question: q.question,
      detailKey: q.detailKey,
      detailLabel: q.detailLabel,
    })),
  };
}
