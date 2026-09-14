import { sql } from './pg';
import { getRamoConfig, rcAdvogadosConfig } from '@/lib/product-schemas';

// Mesma lógica de parse usada no formulário (CotacaoFormRC.tsx) — precisa ficar idêntica
// pro valor exibido pro cliente bater com o que o servidor calcula e efetivamente cobra.
export function parseMoneyToNumber(v?: string | null): number {
  if (!v) return 0;
  const clean = String(v).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(clean) || 0;
}

export const FALLBACK_PLANOS = rcAdvogadosConfig.planos;

async function fetchWixCollectionItems(collectionId: string): Promise<any[]> {
  const items = await sql`
    SELECT payload FROM wix_items
    WHERE wix_collection_id IN (SELECT id FROM wix_collections WHERE collection_id = ${collectionId})
      AND is_active = true
  `;
  return items
    .map((row) => {
      try {
        const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        return parsed?.item?.data || null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function getPlanoRCAdvogados(tipoDePlano: string): Promise<any | null> {
  try {
    const planos = await fetchWixCollectionItems('Planos');
    const found = planos.find((p) => p.tipoDePlano === tipoDePlano);
    if (found) return found;
  } catch {
    // Fallback silencioso em caso de falha transitória com banco ou Wix
  }
  return rcAdvogadosConfig.planos.find((p) => p.tipoDePlano === tipoDePlano) || null;
}

// Mesma checagem de validade/ativo/limite do /api/portal/validar-cupom, mas usada aqui
// como fonte de verdade pro cálculo — nunca aceitar o desconto que o cliente diz ter aplicado.
async function getCupomDescontoValido(cupomCodigo?: string | null): Promise<number> {
  if (!cupomCodigo) return 0;

  const cupons = await fetchWixCollectionItems('CUPOMPROMOCIONAL');
  const cupom = cupons.find((c) => c.codigo?.toLowerCase() === String(cupomCodigo).trim().toLowerCase());
  if (!cupom) return 0;
  if (cupom.cupomAtivo === false) return 0;

  if (cupom.validade) {
    const validDateStr = cupom.validade.$date || cupom.validade;
    if (validDateStr) {
      const validDate = new Date(validDateStr);
      if (!isNaN(validDate.getTime()) && validDate < new Date()) return 0;
    }
  }

  const limite = Number(cupom.quantidade) || 0;
  if (limite > 0) {
    const [uso] = await sql`SELECT usos FROM cupom_usos WHERE cupom_codigo = ${cupom.codigo}`;
    const usados = Number(uso?.usos) || 0;
    if (usados >= limite) return 0;
  }

  return Number(cupom.desconto) || 0;
}

const PARCELA_FIELD: Record<number, string> = {
  2: 'parcela2X',
  3: 'parcela3X',
  4: 'parcela4X',
  5: 'parcela5X',
  6: 'parcela6X',
};

export interface PrecoCalculado {
  valorOriginal: number;
  descontoPercentual: number;
  valorDesconto: number;
  valorTotal: number;
  valorParcela: number;
  qtdParcelas: number;
}

export interface CalcularPrecoServidorParams {
  tipoDePlano: string | null | undefined;
  qtdParcelasSolicitada: number;
  cupomCodigo?: string | null;
  descontoManualPercent?: number | null;
  flowKey?: string | null;
  productId?: string | null;
  productCode?: string | null;
}

// Recalcula o preço inteiramente a partir da tabela canônica de planos (Wix para RC Advogados
// com fallback em FALLBACK_PLANOS / rcAdvogadosConfig.planos, ou RamoConfig para demais ramos)
// e do cupom real / desconto manual — nunca a partir de clientData.valor/valorParcela, que vêm do cliente e são forjáveis.
export async function calcularPrecoServidor(
  params: CalcularPrecoServidorParams
): Promise<PrecoCalculado | null> {
  if (!params.tipoDePlano) return null;

  let resolvedFlowKey = params.flowKey || null;
  let resolvedCode = params.productCode || null;

  if (params.productId && (!resolvedFlowKey || !resolvedCode)) {
    try {
      const [prod] = await sql`
        SELECT flow_key, code FROM products WHERE id = ${params.productId} LIMIT 1
      `;
      if (prod) {
        if (!resolvedFlowKey) resolvedFlowKey = prod.flow_key;
        if (!resolvedCode) resolvedCode = prod.code;
      }
    } catch {
      // continua com os valores disponíveis
    }
  }

  const isRcAdvogados =
    !resolvedFlowKey ||
    resolvedFlowKey === 'rc_advogados_v1' ||
    resolvedFlowKey === 'rc_professional_v1' ||
    resolvedFlowKey === 'rc-advogados';

  let plano: any = null;
  if (isRcAdvogados) {
    plano = await getPlanoRCAdvogados(params.tipoDePlano);
  } else {
    const ramoConfig = getRamoConfig({
      flowKey: resolvedFlowKey || undefined,
      code: resolvedCode || undefined,
    });
    if (ramoConfig) {
      plano = ramoConfig.planos.find((p) => p.tipoDePlano === params.tipoDePlano) || null;
    }
  }

  if (!plano) return null;

  // Desconto manual limitado a no máximo 40% (trava inegociável de segurança comercial)
  const descontoManual = Math.min(40, Math.max(0, Number(params.descontoManualPercent || 0)));

  // Desconto de cupom (se fornecido)
  const descontoCupom = await getCupomDescontoValido(params.cupomCodigo);

  // Aplica o maior desconto válido
  const descontoFinal = Math.max(descontoManual, descontoCupom);
  const fatorDesconto = 1 - descontoFinal / 100;
  const valorOriginal = parseMoneyToNumber(plano.parcela);
  const valorTotal = Math.round(valorOriginal * fatorDesconto * 100) / 100;
  const valorDesconto = Math.round((valorOriginal - valorTotal) * 100) / 100;

  // Plano 100k ou planos com maxParcelas === 1 só permitem pagamento à vista (mesma regra do formulário).
  const maxParcelas =
    plano.maxParcelas != null ? Number(plano.maxParcelas) : plano.tipoDePlano === '100k' ? 1 : 6;
  const permiteParcelamento = maxParcelas > 1 && plano.tipoDePlano !== '100k';

  const qtdParcelas =
    permiteParcelamento &&
    params.qtdParcelasSolicitada <= maxParcelas &&
    PARCELA_FIELD[params.qtdParcelasSolicitada]
      ? params.qtdParcelasSolicitada
      : 1;

  let valorParcela = valorTotal;
  if (qtdParcelas > 1) {
    const field = PARCELA_FIELD[qtdParcelas];
    const raw = plano[field];
    valorParcela = raw
      ? Math.round(parseMoneyToNumber(raw) * fatorDesconto * 100) / 100
      : Math.round((valorTotal / qtdParcelas) * 100) / 100;
  }

  return {
    valorOriginal,
    descontoPercentual: descontoFinal,
    valorDesconto,
    valorTotal,
    valorParcela,
    qtdParcelas,
  };
}
