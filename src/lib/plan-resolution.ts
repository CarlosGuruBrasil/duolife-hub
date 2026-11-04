import { formatCurrency, parseCurrencyToNumber } from './format';

export interface Plano {
  tipoDePlano: string;
  nomeExibido: string;
  cobertura: string;
  franquia: string;
  ordem: number;
  parcela: string;
  parcela2X?: string;
  parcela3X?: string;
  parcela4X?: string;
  parcela5X?: string;
  parcela6X?: string;
  valorPagoKovr?: number;
  planoFranquia?: string;
  maxParcelas?: number;
}

/**
 * Busca de forma tolerante e hierárquica um plano dentro de uma série de listas candidatas
 * (ex: planos carregados pela API, planos do grupo tarifário em memória, catálogo canônico do ramo ou fallback padrão).
 */
export function findMatchingPlanoInLists(
  tipoOrName: string | null | undefined,
  candidateLists: (Plano[] | undefined | null)[]
): Plano | null {
  if (!tipoOrName) return null;
  const target = String(tipoOrName).toLowerCase().trim();
  if (!target) return null;

  for (const list of candidateLists) {
    if (!Array.isArray(list) || list.length === 0) continue;

    // 1. Match exato por tipoDePlano (ex: '100k', '200k', '300k', etc.)
    const byTipo = list.find((p) => p.tipoDePlano?.toLowerCase().trim() === target);
    if (byTipo) return byTipo;

    // 2. Match exato por nomeExibido
    const byNome = list.find((p) => p.nomeExibido?.toLowerCase().trim() === target);
    if (byNome) return byNome;

    // 3. Match parcial/substring se o alvo contiver o identificador do plano
    const bySub = list.find((p) => {
      const pTipo = p.tipoDePlano?.toLowerCase().trim() || '';
      const pNome = p.nomeExibido?.toLowerCase().trim() || '';
      return (
        (pTipo && (target.includes(pTipo) || pTipo.includes(target))) ||
        (pNome && (target.includes(pNome) || pNome.includes(target)))
      );
    });
    if (bySub) return bySub;
  }

  return null;
}

/**
 * Reconcilia um plano que estava no estado local/rascunho com o catálogo oficial carregado,
 * garantindo que valores customizados do rascunho não apaguem strings de parcelamento (parcela2X-6X) com undefined.
 */
export function reconciliarPlanoComCatalogo(current: Partial<Plano> | null, catalogPlano: Plano): Plano {
  if (!catalogPlano) return current as Plano;
  if (!current) return catalogPlano;

  return {
    ...current,
    ...catalogPlano,
    // Garante que todas as faixas de parcelamento venham do plano completo do catálogo
    parcela: catalogPlano.parcela || current.parcela || '0',
    parcela2X: catalogPlano.parcela2X || current.parcela2X,
    parcela3X: catalogPlano.parcela3X || current.parcela3X,
    parcela4X: catalogPlano.parcela4X || current.parcela4X,
    parcela5X: catalogPlano.parcela5X || current.parcela5X,
    parcela6X: catalogPlano.parcela6X || current.parcela6X,
    maxParcelas: catalogPlano.maxParcelas ?? current.maxParcelas ?? (catalogPlano.tipoDePlano === '100k' ? 1 : 6),
  };
}

/**
 * Calcula a grade de opções de parcelamento no padrão do formulário do Passo 5.
 * Se o plano possuir valores pré-definidos (ex: tabela comercial com juros embutidos de 2X, 3X, etc.),
 * utiliza tais strings com o fator de desconto. Caso contrário, divide linearmente até o teto de parcelas.
 */
export function calcularOpcoesParcelamentoForm(
  plano: Partial<Plano>,
  descontoPercentual: number = 0,
  cupomDesconto: number = 0,
  ramoId?: string
): { qtd: number; valor: number }[] {
  const valorOriginal = parseCurrencyToNumber(plano.parcela, 0);
  const maiorDesconto = Math.max(descontoPercentual, cupomDesconto);
  const fatorDesconto = 1 - maiorDesconto / 100;
  const valorComDesconto = Math.round(valorOriginal * fatorDesconto * 100) / 100;

  const parseParcela = (parcStr?: string) => {
    if (!parcStr) return 0;
    return Math.round(parseCurrencyToNumber(parcStr, 0) * fatorDesconto * 100) / 100;
  };

  const maxParcelas =
    plano.maxParcelas != null
      ? Number(plano.maxParcelas)
      : String(plano.tipoDePlano || '').toLowerCase() === '100k'
      ? 1
      : 6;

  // Plano 100k ou planos com maxParcelas === 1 somente permitem 1x (à vista)
  if (maxParcelas <= 1 || String(plano.tipoDePlano || '').toLowerCase() === '100k') {
    return [{ qtd: 1, valor: valorComDesconto }];
  }

  const opcoes = [
    { qtd: 1, valor: valorComDesconto },
    { qtd: 2, valor: parseParcela(plano.parcela2X) || Math.round((valorComDesconto / 2) * 100) / 100 },
    { qtd: 3, valor: parseParcela(plano.parcela3X) || Math.round((valorComDesconto / 3) * 100) / 100 },
    { qtd: 4, valor: parseParcela(plano.parcela4X) || Math.round((valorComDesconto / 4) * 100) / 100 },
    { qtd: 5, valor: parseParcela(plano.parcela5X) || Math.round((valorComDesconto / 5) * 100) / 100 },
    { qtd: 6, valor: parseParcela(plano.parcela6X) || Math.round((valorComDesconto / 6) * 100) / 100 },
  ];

  const validKeys: (keyof Plano)[] = ['parcela', 'parcela2X', 'parcela3X', 'parcela4X', 'parcela5X', 'parcela6X'];
  const hasAnyCustomParcela = Boolean(
    plano.parcela2X || plano.parcela3X || plano.parcela4X || plano.parcela5X || plano.parcela6X
  );

  if (hasAnyCustomParcela) {
    return opcoes.filter((op, i) => {
      if (op.qtd > maxParcelas) return false;
      const key = validKeys[i];
      const val = plano[key];
      return val !== undefined && val !== null && val !== '' && val !== 'R$ 0,00';
    });
  }

  // Divisão linear padrão (quando o plano não tem strings customizadas de parcelas cadastradas)
  return opcoes.filter((op) => {
    if (op.qtd > maxParcelas) return false;
    if (op.qtd === 5 && ramoId === 'rc-advogados') return false;
    return true;
  });
}

/**
 * Resolve a seleção da parcela mantendo a escolha prévia do usuário caso ainda seja válida,
 * ou selecionando à vista se houver somente 1 opção.
 */
export function resolverSelecaoParcela(
  opcoes: { qtd: number; valor: number }[],
  parcelaAtual: { qtd: number; valor: number } | null
): { qtd: number; valor: number } | null {
  if (opcoes.length === 1) {
    const opUnica = opcoes[0];
    return { qtd: opUnica.qtd, valor: opUnica.valor };
  }
  if (parcelaAtual) {
    const opCorrespondente = opcoes.find((op) => op.qtd === parcelaAtual.qtd);
    if (opCorrespondente) {
      return { qtd: opCorrespondente.qtd, valor: opCorrespondente.valor };
    }
  }
  return parcelaAtual;
}

/**
 * Cria um objeto completo de Plano a partir dos dados brutos de uma cotação salva (client_data),
 * garantindo valores e faixas de parcelamento mesmo que o plano não esteja catalogado.
 */
export function buildFallbackPlanoFromClientData(
  cd: Record<string, any>,
  ramoConfig?: { ramoId?: string; planos?: Plano[] } | null
): Plano {
  const tipo = String(cd.tipo || cd.tipoDePlano || 'custom');
  const nome = String(cd.nomePlano || cd.nomeExibido || cd.tipo || 'Plano Personalizado');
  const valorTotalNum = parseCurrencyToNumber(cd.valor || cd.premio || cd.parcela, 0);
  const maxP = cd.maxParcelas
    ? Number(cd.maxParcelas)
    : tipo.toLowerCase() === '100k'
    ? 1
    : 6;

  const isAdv = ramoConfig?.ramoId === 'rc-advogados';

  return {
    tipoDePlano: tipo,
    nomeExibido: nome,
    cobertura: cd.valorCobertura || cd.cobertura || 'R$ 100.000,00',
    franquia: cd.planoFranquia || cd.franquia || 'R$ 1.000,00',
    ordem: 1,
    parcela: String(cd.valor || cd.parcela || '0'),
    parcela2X: cd.parcela2X || (maxP >= 2 ? formatCurrency(Math.round((valorTotalNum / 2) * 100) / 100) : undefined),
    parcela3X: cd.parcela3X || (maxP >= 3 ? formatCurrency(Math.round((valorTotalNum / 3) * 100) / 100) : undefined),
    parcela4X: cd.parcela4X || (maxP >= 4 ? formatCurrency(Math.round((valorTotalNum / 4) * 100) / 100) : undefined),
    parcela5X: cd.parcela5X || (maxP >= 5 && !isAdv ? formatCurrency(Math.round((valorTotalNum / 5) * 100) / 100) : undefined),
    parcela6X: cd.parcela6X || (maxP >= 6 ? formatCurrency(Math.round((valorTotalNum / 6) * 100) / 100) : undefined),
    valorPagoKovr: 0,
    maxParcelas: maxP,
  };
}
