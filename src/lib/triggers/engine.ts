import type {
  NoArvore,
  TriggerEvaluationContext,
  OperadorCondicao,
  ConfiguracaoNo,
} from './types';

export interface EvaluatedNodeResult {
  nodeId: string;
  tipo: NoArvore['tipo'];
  evaluatedTo: boolean;
  reason?: string;
}

export interface EvaluationOutcome {
  evaluatedNodes: EvaluatedNodeResult[];
  executableActions: NoArvore[];
}

/**
 * Obtém valor aninhado de um objeto via notação de ponto (ex: 'cotacao.status')
 */
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const keys = path.split('.');
  let current = obj;
  for (const k of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[k];
  }
  return current;
}

/**
 * Avalia operador condicional entre o valor real do contexto e o esperado
 */
export function evaluateCondition(
  actualValue: any,
  operator: OperadorCondicao = 'IGUAL',
  expectedValue?: string
): boolean {
  if (expectedValue === undefined || expectedValue === null) {
    return false;
  }

  const actualStr = actualValue !== undefined && actualValue !== null ? String(actualValue).trim().toLowerCase() : '';
  const expectedStr = expectedValue.trim().toLowerCase();

  switch (operator) {
    case 'IGUAL':
      return actualStr === expectedStr;

    case 'DIFERENTE':
      return actualStr !== expectedStr;

    case 'CONTEM':
      return actualStr.includes(expectedStr);

    case 'MAIOR': {
      const actualNum = Number(actualValue);
      const expectedNum = Number(expectedValue);
      if (isNaN(actualNum) || isNaN(expectedNum)) return false;
      return actualNum > expectedNum;
    }

    case 'MENOR': {
      const actualNum = Number(actualValue);
      const expectedNum = Number(expectedValue);
      if (isNaN(actualNum) || isNaN(expectedNum)) return false;
      return actualNum < expectedNum;
    }

    case 'ESTA_EM': {
      const list = expectedStr.split(',').map((s) => s.trim());
      return list.includes(actualStr);
    }

    case 'NAO_ESTA_EM': {
      const list = expectedStr.split(',').map((s) => s.trim());
      return !list.includes(actualStr);
    }

    default:
      return actualStr === expectedStr;
  }
}

/**
 * Avalia a árvore de decisão para um dado contexto e retorna os nós avaliados e as ações a executar
 */
export function evaluateDecisionTree(
  nos: NoArvore[],
  context: TriggerEvaluationContext
): EvaluationOutcome {
  const evaluatedNodes: EvaluatedNodeResult[] = [];
  const nodeMap = new Map<string, NoArvore>();
  const childrenMap = new Map<string, NoArvore[]>();

  for (const no of nos) {
    nodeMap.set(no.id, no);
    if (no.parentId) {
      const list = childrenMap.get(no.parentId) || [];
      list.push(no);
      childrenMap.set(no.parentId, list);
    }
  }

  // 1. Localiza nó Raiz
  const rootNode = nos.find((n) => n.tipo === 'GATILHO');
  if (!rootNode || rootNode.ativo === false) {
    return { evaluatedNodes: [], executableActions: [] };
  }

  evaluatedNodes.push({
    nodeId: rootNode.id,
    tipo: 'GATILHO',
    evaluatedTo: true,
    reason: `Gatilho raiz ativado para evento ${context.eventType}`,
  });

  const executableActions: NoArvore[] = [];
  const visited = new Set<string>();

  // 2. Função recursiva de avaliação de galho
  function evaluateBranch(parentId: string, depth = 0): boolean {
    if (depth > 25) {
      evaluatedNodes.push({
        nodeId: parentId,
        tipo: 'GATILHO',
        evaluatedTo: false,
        reason: 'Limite de profundidade da árvore excedido (máximo 25 níveis)',
      });
      return false;
    }

    const children = childrenMap.get(parentId) || [];
    if (children.length === 0) return true;

    for (const child of children) {
      if (visited.has(child.id)) {
        evaluatedNodes.push({
          nodeId: child.id,
          tipo: child.tipo,
          evaluatedTo: false,
          reason: 'Ciclo detectado na árvore de decisão — nó ignorado',
        });
        continue;
      }
      visited.add(child.id);

      if (child.ativo === false) {
        evaluatedNodes.push({
          nodeId: child.id,
          tipo: child.tipo,
          evaluatedTo: false,
          reason: 'Nó desativado',
        });
        continue;
      }

      let childPassed = false;

      if (child.tipo === 'CONDICAO_SE') {
        const config: ConfiguracaoNo = child.configuracao || {};
        const actualVal = config.campo ? getNestedValue(context, config.campo) : undefined;
        childPassed = evaluateCondition(actualVal, config.operador || 'IGUAL', config.valor_comparacao);

        evaluatedNodes.push({
          nodeId: child.id,
          tipo: 'CONDICAO_SE',
          evaluatedTo: childPassed,
          reason: `Campo ${config.campo} ('${actualVal}') ${config.operador} '${config.valor_comparacao}' => ${childPassed}`,
        });

        if (childPassed) {
          evaluateBranch(child.id, depth + 1);
        }
      } else if (child.tipo === 'LOGICO_E') {
        // Apenas filhos condicionais devem ser avaliados para aprovação do bloco E
        const grandChildren = childrenMap.get(child.id) || [];
        const conditionChildren = grandChildren.filter((gc) =>
          gc.tipo === 'CONDICAO_SE' || gc.tipo === 'LOGICO_E' || gc.tipo === 'LOGICO_OU'
        );

        const results = conditionChildren.map((gc) => {
          if (gc.tipo === 'CONDICAO_SE') {
            const config = gc.configuracao || {};
            const actualVal = config.campo ? getNestedValue(context, config.campo) : undefined;
            const res = evaluateCondition(actualVal, config.operador || 'IGUAL', config.valor_comparacao);
            evaluatedNodes.push({
              nodeId: gc.id,
              tipo: 'CONDICAO_SE',
              evaluatedTo: res,
              reason: `Subcondição E: ${config.campo} ${config.operador} ${config.valor_comparacao} => ${res}`,
            });
            visited.add(gc.id);
            return res;
          }
          return false;
        });

        childPassed = results.length > 0 && results.every(Boolean);
        evaluatedNodes.push({
          nodeId: child.id,
          tipo: 'LOGICO_E',
          evaluatedTo: childPassed,
          reason: `Operador E: ${results.filter(Boolean).length}/${results.length} satisfeitas`,
        });

        if (childPassed) {
          evaluateBranch(child.id, depth + 1);
        }
      } else if (child.tipo === 'LOGICO_OU') {
        // Apenas filhos condicionais devem ser avaliados para aprovação do bloco OU
        const grandChildren = childrenMap.get(child.id) || [];
        const conditionChildren = grandChildren.filter((gc) =>
          gc.tipo === 'CONDICAO_SE' || gc.tipo === 'LOGICO_E' || gc.tipo === 'LOGICO_OU'
        );

        const results = conditionChildren.map((gc) => {
          if (gc.tipo === 'CONDICAO_SE') {
            const config = gc.configuracao || {};
            const actualVal = config.campo ? getNestedValue(context, config.campo) : undefined;
            const res = evaluateCondition(actualVal, config.operador || 'IGUAL', config.valor_comparacao);
            evaluatedNodes.push({
              nodeId: gc.id,
              tipo: 'CONDICAO_SE',
              evaluatedTo: res,
              reason: `Subcondição OU: ${config.campo} ${config.operador} ${config.valor_comparacao} => ${res}`,
            });
            visited.add(gc.id);
            return res;
          }
          return false;
        });

        childPassed = results.length > 0 && results.some(Boolean);
        evaluatedNodes.push({
          nodeId: child.id,
          tipo: 'LOGICO_OU',
          evaluatedTo: childPassed,
          reason: `Operador OU: ${results.filter(Boolean).length > 0 ? 'pelo menos uma satisfeita' : 'nenhuma satisfeita'}`,
        });

        if (childPassed) {
          evaluateBranch(child.id, depth + 1);
        }
      } else if (child.tipo.startsWith('ACAO_')) {
        // Ação ativada!
        executableActions.push(child);
        evaluatedNodes.push({
          nodeId: child.id,
          tipo: child.tipo,
          evaluatedTo: true,
          reason: `Ação ${child.tipo} liberada para execução`,
        });

        // Ações também podem ter filhos subsequentes
        evaluateBranch(child.id, depth + 1);
      }
    }

    return true;
  }

  evaluateBranch(rootNode.id, 0);

  return { evaluatedNodes, executableActions };
}
