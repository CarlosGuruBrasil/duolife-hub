import { sql } from './pg';

// Mesma lógica de parse usada no formulário (CotacaoFormRC.tsx) — precisa ficar idêntica
// pro valor exibido pro cliente bater com o que o servidor calcula e efetivamente cobra.
function parseMoneyToNumber(v?: string | null): number {
  if (!v) return 0;
  const clean = String(v).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(clean) || 0;
}

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

async function getPlano(tipoDePlano: string): Promise<any | null> {
  const planos = await fetchWixCollectionItems('Planos');
  return planos.find((p) => p.tipoDePlano === tipoDePlano) || null;
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

const PARCELA_FIELD: Record<number, string> = { 2: 'parcela2X', 3: 'parcela3X', 4: 'parcela4X', 6: 'parcela6X' };

export interface PrecoCalculado {
  valorTotal: number;
  valorParcela: number;
  qtdParcelas: number;
}

// Recalcula o preço inteiramente a partir da tabela canônica de planos (Wix) e do cupom real —
// nunca a partir de clientData.valor/valorParcela, que vêm do cliente e são forjáveis.
export async function calcularPrecoServidor(params: {
  tipoDePlano: string | null | undefined;
  qtdParcelasSolicitada: number;
  cupomCodigo?: string | null;
}): Promise<PrecoCalculado | null> {
  if (!params.tipoDePlano) return null;

  const plano = await getPlano(params.tipoDePlano);
  if (!plano) return null;

  const desconto = await getCupomDescontoValido(params.cupomCodigo);
  const fatorDesconto = 1 - desconto / 100;
  const valorOriginal = parseMoneyToNumber(plano.parcela);
  const valorTotal = valorOriginal * fatorDesconto;

  // Plano 100k só permite pagamento à vista (mesma regra do formulário).
  const permiteParcelamento = plano.tipoDePlano !== '100k';
  const qtdParcelas = permiteParcelamento && PARCELA_FIELD[params.qtdParcelasSolicitada]
    ? params.qtdParcelasSolicitada
    : 1;

  let valorParcela = valorTotal;
  if (qtdParcelas > 1) {
    const field = PARCELA_FIELD[qtdParcelas];
    const raw = plano[field];
    valorParcela = raw ? parseMoneyToNumber(raw) * fatorDesconto : valorTotal / qtdParcelas;
  }

  return { valorTotal, valorParcela, qtdParcelas };
}
