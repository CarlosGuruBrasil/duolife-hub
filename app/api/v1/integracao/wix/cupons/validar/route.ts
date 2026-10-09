import { NextRequest, NextResponse } from 'next/server';
import { authenticateWixRequest } from '@/lib/wix-integration-auth';
import { sql } from '@/lib/pg';
import { rcAdvogadosConfig } from '@/lib/product-schemas';
import { formatCurrency, parseCurrencyToNumber } from '@/lib/format';
import { logger } from '@/lib/logger';

interface CupomPayload {
  codigo?: string;
  nome?: string;
  desconto?: number | string;
  cupomAtivo?: boolean;
  validade?: string | { $date?: string };
  quantidade?: number | string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { codigo, planoId, valorBase } = body;

    if (!codigo || typeof codigo !== 'string' || codigo.trim().length === 0) {
      return NextResponse.json(
        {
          valido: false,
          error: 'Código do cupom é obrigatório.',
        },
        { status: 400 }
      );
    }

    const searchCode = codigo.trim().toLowerCase();

    // 1. Busca cupons na coleção do Wix armazenada em wix_items
    const items = await sql`
      SELECT payload
      FROM wix_items
      WHERE wix_collection_id IN (
        SELECT id FROM wix_collections WHERE collection_id = 'CUPOMPROMOCIONAL'
      )
      AND is_active = true
    `;

    const cupons = items
      .map((row) => {
        try {
          const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          return (parsed?.item?.data as CupomPayload) || null;
        } catch {
          return null;
        }
      })
      .filter((c): c is CupomPayload => Boolean(c && c.codigo));

    const cupom = cupons.find((c) => c.codigo?.toLowerCase() === searchCode);

    if (!cupom) {
      return NextResponse.json(
        {
          valido: false,
          error: 'Cupom promocional não encontrado ou inexistente.',
        },
        { status: 404 }
      );
    }

    // 2. Valida se o cupom está ativo
    if (cupom.cupomAtivo === false) {
      return NextResponse.json(
        {
          valido: false,
          error: 'Este cupom promocional está inativo no momento.',
        },
        { status: 400 }
      );
    }

    // 3. Valida data de validade / expiração
    if (cupom.validade) {
      const validDateStr =
        typeof cupom.validade === 'object' && cupom.validade !== null && '$date' in cupom.validade
          ? cupom.validade.$date
          : String(cupom.validade);

      if (validDateStr) {
        const validDate = new Date(validDateStr);
        if (!isNaN(validDate.getTime()) && validDate < new Date()) {
          return NextResponse.json(
            {
              valido: false,
              error: 'Este cupom promocional já expirou.',
            },
            { status: 400 }
          );
        }
      }
    }

    // 4. Valida limite de utilizações contra a tabela cupom_usos
    const cupomCodigo = String(cupom.codigo);
    const limite = Number(cupom.quantidade) || 0;
    if (limite > 0) {
      const [uso] = await sql`
        SELECT usos FROM cupom_usos WHERE cupom_codigo = ${cupomCodigo}
      `;
      const usados = Number(uso?.usos) || 0;
      if (usados >= limite) {
        return NextResponse.json(
          {
            valido: false,
            error: 'O limite de utilizações deste cupom foi atingido.',
          },
          { status: 400 }
        );
      }
    }

    // 5. Aplica a Regra BR-001: Teto inegociável de 40% de desconto
    const rawDesconto = Number(cupom.desconto) || 0;
    const desconto = Math.min(40, Math.max(0, rawDesconto));
    const fatorDesconto = 1 - desconto / 100;

    // 6. Resolução de valor original para cálculo de simulação
    let valorOriginal: number | null = null;
    let maxParcelas = 6;
    let planoEncontrado: any = null;

    if (planoId) {
      planoEncontrado = rcAdvogadosConfig.planos.find(
        (p) => p.tipoDePlano === String(planoId).toLowerCase()
      );
      if (planoEncontrado) {
        valorOriginal = parseCurrencyToNumber(planoEncontrado.parcela, 0);
        maxParcelas =
          planoEncontrado.maxParcelas != null
            ? Number(planoEncontrado.maxParcelas)
            : planoEncontrado.tipoDePlano === '100k'
            ? 1
            : 6;
      }
    }

    if (valorOriginal === null && valorBase != null) {
      const parsedBase =
        typeof valorBase === 'number' ? valorBase : parseCurrencyToNumber(String(valorBase), 0);
      if (parsedBase > 0) {
        valorOriginal = parsedBase;
      }
    }

    let valorFinal: number | null = null;
    let parcelas: Array<{
      parcelas: number;
      valorParcela: number;
      valorTotal: number;
      descricao: string;
    }> = [];

    if (valorOriginal !== null && valorOriginal > 0) {
      valorFinal = Math.round(valorOriginal * fatorDesconto * 100) / 100;

      for (let n = 1; n <= 6; n++) {
        if (n > maxParcelas) continue;

        let vParcela: number;
        if (n === 1) {
          vParcela = valorFinal;
        } else {
          const field =
            n === 2
              ? 'parcela2X'
              : n === 3
              ? 'parcela3X'
              : n === 4
              ? 'parcela4X'
              : n === 5
              ? 'parcela5X'
              : 'parcela6X';

          if (planoEncontrado && planoEncontrado[field]) {
            vParcela =
              Math.round(parseCurrencyToNumber(planoEncontrado[field], 0) * fatorDesconto * 100) /
              100;
          } else {
            vParcela = Math.round((valorFinal / n) * 100) / 100;
          }
        }

        const vTotal = Math.round(vParcela * n * 100) / 100;
        parcelas.push({
          parcelas: n,
          valorParcela: vParcela,
          valorTotal: vTotal,
          descricao: `${n}x de ${formatCurrency(vParcela)}`,
        });
      }
    }

    logger.info(
      {
        cupomCodigo: cupom.codigo,
        descontoAplicado: desconto,
        rawDesconto,
        valorOriginal,
        valorFinal,
      },
      'wix.cupom.validado_com_sucesso'
    );

    return NextResponse.json({
      valido: true,
      cupom: {
        codigo: cupom.codigo,
        nome: cupom.nome || cupom.codigo,
        tipo: 'percentual',
        desconto,
        descontoOriginal: rawDesconto,
        tetoAplicado: rawDesconto > 40,
        valorOriginal,
        valorFinal,
        valorDesconto: valorOriginal !== null && valorFinal !== null ? Math.round((valorOriginal - valorFinal) * 100) / 100 : null,
        parcelas,
      },
    });
  } catch (err) {
    logger.error({ err }, 'wix.cupom.validacao_falhou');
    return NextResponse.json(
      {
        valido: false,
        error: 'Erro interno ao validar cupom promocional.',
      },
      { status: 500 }
    );
  }
}
