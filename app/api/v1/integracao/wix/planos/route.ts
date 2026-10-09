import { NextRequest, NextResponse } from 'next/server';
import { authenticateWixRequest } from '@/lib/wix-integration-auth';
import { rcAdvogadosConfig } from '@/lib/product-schemas';
import { sql } from '@/lib/pg';
import { formatCurrency, parseCurrencyToNumber } from '@/lib/format';
import { logger } from '@/lib/logger';

interface PlanoRaw {
  tipoDePlano: string;
  nomeExibido?: string;
  cobertura?: string;
  franquia?: string;
  ordem?: number;
  parcela?: string;
  parcela2X?: string;
  parcela3X?: string;
  parcela4X?: string;
  parcela5X?: string;
  parcela6X?: string;
  maxParcelas?: number | string;
  [key: string]: unknown;
}

async function getPlanosEfetivos(): Promise<PlanoRaw[]> {
  try {
    const items = await sql`
      SELECT payload FROM wix_items
      WHERE wix_collection_id IN (SELECT id FROM wix_collections WHERE collection_id = 'Planos')
        AND is_active = true
    `;

    const wixPlanos = items
      .map((row) => {
        try {
          const parsed = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          return (parsed?.item?.data as PlanoRaw) || null;
        } catch {
          return null;
        }
      })
      .filter((p): p is PlanoRaw => Boolean(p && p.tipoDePlano));

    if (wixPlanos.length > 0) {
      // Mescla com a base de rcAdvogadosConfig para garantir completude dos campos
      return rcAdvogadosConfig.planos.map((basePlano) => {
        const foundWix = wixPlanos.find((wp) => wp.tipoDePlano === basePlano.tipoDePlano);
        return {
          ...basePlano,
          ...(foundWix || {}),
        };
      });
    }
  } catch (err) {
    logger.warn({ err }, 'wix.planos.fetch_from_wix_items_failed_fallback_to_config');
  }

  return rcAdvogadosConfig.planos as PlanoRaw[];
}

function calcularTabelaParcelamento(plano: PlanoRaw) {
  const valorAnual = parseCurrencyToNumber(plano.parcela, 0);
  const maxParcelas =
    plano.maxParcelas != null ? Number(plano.maxParcelas) : plano.tipoDePlano === '100k' ? 1 : 6;

  const parcelas: Array<{
    parcelas: number;
    valorParcela: number;
    valorTotal: number;
    descricao: string;
  }> = [];

  for (let n = 1; n <= 6; n++) {
    if (n > maxParcelas) continue;

    let vParcela: number;
    if (n === 1) {
      vParcela = valorAnual;
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

      const customStr = plano[field];
      if (typeof customStr === 'string' && customStr.trim().length > 0) {
        vParcela = parseCurrencyToNumber(customStr, 0);
      } else {
        vParcela = Math.round((valorAnual / n) * 100) / 100;
      }
    }

    const valorTotal = Math.round(vParcela * n * 100) / 100;
    parcelas.push({
      parcelas: n,
      valorParcela: vParcela,
      valorTotal: valorTotal,
      descricao: `${n}x de ${formatCurrency(vParcela)}`,
    });
  }

  return parcelas;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const rawPlanos = await getPlanosEfetivos();

    const planos = rawPlanos
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
      .map((plano) => {
        const valorAnual = parseCurrencyToNumber(plano.parcela, 0);
        const coberturaValor = parseCurrencyToNumber(plano.cobertura, 0);
        const franquiaValor = parseCurrencyToNumber(plano.franquia, 0);
        const maxParcelas =
          plano.maxParcelas != null
            ? Number(plano.maxParcelas)
            : plano.tipoDePlano === '100k'
            ? 1
            : 6;

        return {
          id: plano.tipoDePlano,
          tipoDePlano: plano.tipoDePlano,
          nome: plano.nomeExibido || `Plano ${plano.tipoDePlano.toUpperCase()}`,
          ordem: plano.ordem || 1,
          cobertura: plano.cobertura || formatCurrency(coberturaValor),
          coberturaValor,
          franquia: plano.franquia || formatCurrency(franquiaValor),
          franquiaValor,
          valorAnual,
          valorFormatado: formatCurrency(valorAnual),
          maxParcelas,
          permiteParcelamento: maxParcelas > 1,
          parcelamento: calcularTabelaParcelamento(plano),
        };
      });

    logger.info(
      {
        clientName: auth.context.clientName,
        planosCount: planos.length,
      },
      'wix.planos.retrieved_successfully'
    );

    return NextResponse.json({
      success: true,
      produto: {
        codigo: 'RC-001',
        ramo: 'rc-advogados',
        nome: rcAdvogadosConfig.name,
        seguradora: 'Akad Seguros',
      },
      planos,
    });
  } catch (err) {
    logger.error({ err }, 'wix.planos.unhandled_error');
    return NextResponse.json(
      {
        success: false,
        error: 'Erro interno ao consultar catálogo de planos.',
      },
      { status: 500 }
    );
  }
}
