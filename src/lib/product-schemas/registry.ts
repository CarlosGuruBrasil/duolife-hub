import { z } from 'zod';
import { RamoConfig, MultiRamoFormState } from './types';
import { rcAdvogadosConfig } from './definitions/rc-advogados';
import { rcMedicosConfig } from './definitions/rc-medicos';
import { rcOdontoConfig } from './definitions/rc-odonto';
import { rcEngenheirosConfig } from './definitions/rc-engenheiros';
import { rcContadoresConfig } from './definitions/rc-contadores';
import { doExecutivosConfig } from './definitions/do-executivos';

/**
 * Registro Central de Todos os Ramos de Seguro Suportados pelo DuoLife Hub.
 * Chave primária canônica: ramoId.
 */
export const RAMOS_REGISTRY: Record<string, RamoConfig> = {
  'rc-advogados': rcAdvogadosConfig,
  'rc-medicos': rcMedicosConfig,
  'rc-odonto': rcOdontoConfig,
  'rc-engenheiros': rcEngenheirosConfig,
  'rc-contadores': rcContadoresConfig,
  'do-executivos': doExecutivosConfig,
};

/**
 * Mapeamento secundário de aliases, códigos e flow_keys para os ramos canônicos correspondentes.
 */
const RAMO_KEY_ALIASES: Record<string, string> = {
  // RC Advogados (Aliases & retrocompatibilidade com flow legado)
  'rc-advogados': 'rc-advogados',
  'rc_advogados': 'rc-advogados',
  'rc_advogados_v1': 'rc-advogados',
  'rc_professional_v1': 'rc-advogados',
  'rc-adv-001': 'rc-advogados',
  'rc_adv_001': 'rc-advogados',
  'rc-001': 'rc-advogados',
  'rc_001': 'rc-advogados',
  'advogados': 'rc-advogados',
  'advocacia': 'rc-advogados',
  'dl-rc': 'rc-advogados',
  'dl-rc-adv': 'rc-advogados',

  // RC Médicos
  'rc-medicos': 'rc-medicos',
  'rc_medicos': 'rc-medicos',
  'rc_medicos_v1': 'rc-medicos',
  'rc-med-001': 'rc-medicos',
  'rc_med_001': 'rc-medicos',
  'medicos': 'rc-medicos',
  'medicina': 'rc-medicos',
  'rc-medico': 'rc-medicos',
  'dl-rc-med': 'rc-medicos',

  // RC Odontologia
  'rc-odonto': 'rc-odonto',
  'rc_odonto': 'rc-odonto',
  'rc_odonto_v1': 'rc-odonto',
  'rc-odonto-001': 'rc-odonto',
  'rc_odonto_001': 'rc-odonto',
  'rc-odo-001': 'rc-odonto',
  'odonto': 'rc-odonto',
  'odontologia': 'rc-odonto',
  'dentistas': 'rc-odonto',
  'rc-dentistas': 'rc-odonto',
  'dl-rc-odo': 'rc-odonto',

  // RC Engenheiros & Arquitetos
  'rc-engenheiros': 'rc-engenheiros',
  'rc_engenheiros': 'rc-engenheiros',
  'rc-engenharia': 'rc-engenheiros',
  'rc_engenharia': 'rc-engenheiros',
  'rc_engenharia_v1': 'rc-engenheiros',
  'rc-eng-001': 'rc-engenheiros',
  'rc_eng_001': 'rc-engenheiros',
  'engenheiros': 'rc-engenheiros',
  'engenharia': 'rc-engenheiros',
  'arquitetos': 'rc-engenheiros',
  'dl-rc-eng': 'rc-engenheiros',

  // RC Contadores
  'rc-contadores': 'rc-contadores',
  'rc_contadores': 'rc-contadores',
  'rc-contabilidade': 'rc-contadores',
  'rc_contabilidade': 'rc-contadores',
  'rc_contabilidade_v1': 'rc-contadores',
  'rc-cont-001': 'rc-contadores',
  'rc_cont_001': 'rc-contadores',
  'contadores': 'rc-contadores',
  'contabilidade': 'rc-contadores',
  'dl-rc-cnt': 'rc-contadores',

  // D&O Executivos
  'do-executivos': 'do-executivos',
  'do_executivos': 'do-executivos',
  'do_executivos_v1': 'do-executivos',
  'do_corporate_v1': 'do-executivos',
  'do-corp-001': 'do-executivos',
  'do_corp_001': 'do-executivos',
  'do-001': 'do-executivos',
  'do': 'do-executivos',
  'd&o': 'do-executivos',
  'diretores_administradores': 'do-executivos',
  'executivos': 'do-executivos',
  'dl-do': 'do-executivos',
};

/**
 * Retorna todos os ramos de seguros registrados no sistema DuoLife.
 */
export function getAllRegisteredRamos(): RamoConfig[] {
  return Object.values(RAMOS_REGISTRY);
}

/**
 * Normalizador seguro de strings para busca no registro de ramos.
 */
function normalizeKey(str: string): string {
  return str.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/**
 * Busca a configuração de um ramo de seguro com base em múltiplos identificadores:
 * ramoId, flowKey, código de produto ou categoria.
 * 
 * Se o parâmetro for nulo, indefinido, vazio ou 'rc_professional_v1',
 * retorna a configuração canônica de RC Advogados como fallback retrocompatível seguro.
 */
export function getRamoConfig(
  keyOrProduct?:
    | string
    | {
        ramoId?: string;
        flowKey?: string;
        flow_key?: string;
        category?: string;
        code?: string;
        pricingStrategy?: string;
        pricing_strategy?: string;
      }
    | null
): RamoConfig | null {
  if (!keyOrProduct) {
    return rcAdvogadosConfig;
  }

  // Se o argumento for um objeto (como uma linha de produto do banco de dados)
  if (typeof keyOrProduct === 'object') {
    const candidateKeys = [
      keyOrProduct.ramoId,
      keyOrProduct.flowKey,
      keyOrProduct.flow_key,
      keyOrProduct.code,
      keyOrProduct.category,
      keyOrProduct.pricingStrategy,
      keyOrProduct.pricing_strategy,
    ].filter((k): k is string => typeof k === 'string' && k.trim().length > 0);

    if (candidateKeys.length === 0) {
      return rcAdvogadosConfig;
    }

    for (const key of candidateKeys) {
      const found = resolveRamoConfigFromString(key);
      if (found) return found;
    }

    return null;
  }

  // Se o argumento for string
  if (keyOrProduct === '') {
    return rcAdvogadosConfig;
  }

  const resolved = resolveRamoConfigFromString(keyOrProduct);
  return resolved || null;
}

/**
 * Resolução interna de RamoConfig a partir de uma chave textual.
 */
function resolveRamoConfigFromString(rawKey: string): RamoConfig | null {
  if (!rawKey || typeof rawKey !== 'string') return null;

  const normalized = normalizeKey(rawKey);
  if (!normalized) return null;

  // 1. Busca direta no mapa de aliases
  const mappedId = RAMO_KEY_ALIASES[normalized];
  if (mappedId && RAMOS_REGISTRY[mappedId]) {
    return RAMOS_REGISTRY[mappedId];
  }

  // 2. Busca direta no registro canônico
  if (RAMOS_REGISTRY[normalized]) {
    return RAMOS_REGISTRY[normalized];
  }

  // 3. Varredura por flowKeys ou prefixo
  for (const ramo of Object.values(RAMOS_REGISTRY)) {
    if (ramo.ramoId.toLowerCase() === normalized) return ramo;
    if (ramo.flowKeys.some((fk) => normalizeKey(fk) === normalized)) return ramo;
    if (ramo.policyPrefix.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) return ramo;
  }

  return null;
}

// -------------------------------------------------------------------------
// Validadores e Helpers Zod para Esquemas Declarativos Multi-Ramo
// -------------------------------------------------------------------------

/**
 * Remove caracteres de máscara de CPF/CNPJ/Telefone/CEP.
 */
function cleanDigits(val: unknown): string {
  return String(val || '').replace(/\D/g, '');
}

/**
 * Validador sintático de CPF (11 dígitos) e CNPJ (14 dígitos).
 */
function isCleanCpfOrCnpj(val: string): boolean {
  const digits = cleanDigits(val);
  return digits.length === 11 || digits.length === 14;
}

/**
 * Constrói o esquema de validação do Passo 1: Seleção de Plano e Condições Comerciais.
 */
export function buildRamoStep1Schema(ramo: RamoConfig) {
  const validPlanos = ramo.planos.map((p) => p.tipoDePlano);

  return z.object({
    tipoDePlano: z
      .string()
      .min(1, 'A seleção de um plano de cobertura é obrigatória.')
      .refine(
        (val) => validPlanos.includes(val),
        `Plano selecionado inválido para o ramo ${ramo.shortName}. Planos válidos: ${validPlanos.join(', ')}`
      ),
    qtdParcelas: z
      .number()
      .int('A quantidade de parcelas deve ser um número inteiro.')
      .min(1, 'Mínimo de 1 parcela.')
      .max(6, 'Máximo de 6 parcelas.')
      .optional(),
    descontoManualPercent: z
      .number()
      .min(0, 'Desconto não pode ser negativo.')
      .max(40, 'O desconto comercial máximo permitido é de 40%.')
      .optional(),
    cupomCodigo: z.string().optional(),
  });
}

/**
 * Constrói o esquema de validação do Passo 2: Dados do Proponente / Segurado / Tomador.
 */
export function buildRamoStep2Schema(ramo: RamoConfig) {
  const isDoCorp = ramo.ramoId === 'do-executivos';
  const regConfig = ramo.registroProfissional;

  const baseSchema = z.object({
    nome: z.string().trim().min(3, 'O nome completo do proponente deve ter ao menos 3 caracteres.'),
    cpfCnpj: z
      .string()
      .trim()
      .min(11, 'CPF ou CNPJ inválido.')
      .refine(isCleanCpfOrCnpj, 'Formato de CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.'),
    email: z.string().trim().email('Informe um endereço de e-mail válido.'),
    celular: z
      .string()
      .trim()
      .refine((val) => cleanDigits(val).length >= 10, 'O número de celular deve ter DDD e no mínimo 8 dígitos.'),
    dataNascto: z.string().optional(),
    dataAtividade: z.string().optional(),

    // Endereço
    cep: z
      .string()
      .trim()
      .refine((val) => cleanDigits(val).length === 8, 'O CEP deve conter 8 dígitos numéricos.'),
    logradouro: z.string().trim().min(2, 'O logradouro é obrigatório.'),
    numero: z.string().trim().min(1, 'O número do endereço é obrigatório.'),
    complemento: z.string().trim().optional(),
    bairro: z.string().trim().min(1, 'O bairro é obrigatório.'),
    cidade: z.string().trim().min(2, 'A cidade é obrigatória.'),
    uf: z
      .string()
      .trim()
      .length(2, 'A UF deve ter exatamente 2 caracteres (Ex: SP, RJ).')
      .transform((val) => val.toUpperCase()),

    // Registros profissionais dinâmicos e retrocompatíveis
    registroProfissionalNumero: z.string().optional(),
    registroProfissionalUf: z.string().optional(),
    rqe: z.string().optional(),
    oab: z.string().optional(),
    crm: z.string().optional(),
    crmUf: z.string().optional(),
    cro: z.string().optional(),
    croUf: z.string().optional(),
    creaCau: z.string().optional(),
    creaCauUf: z.string().optional(),
    crc: z.string().optional(),
    crcUf: z.string().optional(),

    // Campos adicionais de PJ Tomadora (D&O Executivos)
    razaoSocialTomadora: z.string().optional(),
    cnpjTomadora: z.string().optional(),
    ativoTotal: z.string().optional(),
    faturamentoAnual: z.string().optional(),
  });

  return baseSchema.superRefine((data, ctx) => {
    // Validação de conselho profissional para pessoas físicas
    if (regConfig && regConfig.required) {
      const regKey = regConfig.key;
      const specificValue = data[regKey as keyof typeof data];
      const genericValue = data.registroProfissionalNumero;

      if (!specificValue && !genericValue) {
        ctx.addIssue({
          code: 'custom',
          path: [regKey],
          message: `${regConfig.label} é de preenchimento obrigatório para ${ramo.shortName}.`,
        });
      }
    }

    // Validação de dados da Tomadora para Seguro D&O
    if (isDoCorp) {
      if (!data.razaoSocialTomadora || data.razaoSocialTomadora.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['razaoSocialTomadora'],
          message: 'Razão Social da Tomadora é obrigatória para o Seguro D&O.',
        });
      }

      if (!data.cnpjTomadora || cleanDigits(data.cnpjTomadora).length !== 14) {
        ctx.addIssue({
          code: 'custom',
          path: ['cnpjTomadora'],
          message: 'CNPJ da Sociedade Tomadora deve conter 14 dígitos válidos.',
        });
      }

      if (!data.ativoTotal || data.ativoTotal.trim().length < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['ativoTotal'],
          message: 'Ativo Total da Sociedade Tomadora é obrigatório.',
        });
      }

      if (!data.faturamentoAnual || data.faturamentoAnual.trim().length < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['faturamentoAnual'],
          message: 'Faturamento Anual da Tomadora é obrigatório.',
        });
      }
    }
  });
}

/**
 * Constrói o esquema de validação do Passo 3: Perfil Profissional, Áreas de Atuação e Riscos.
 */
export function buildRamoStep3Schema(ramo: RamoConfig) {
  const schema = z.object({
    tipoDePlano: z.string().optional(),
    faturamentoAntes: z.string().optional(),
    faturamentoDepois: z.string().optional(),
    especialidades: z.array(z.string()).optional(),
    atuacao: z.array(z.string()).optional(),
    ppeCargos: z.enum(['Sim', 'Não']).default('Não'),
    ppeRepresenta: z.enum(['Sim', 'Não']).default('Não'),
    ppeCargoSelect: z.array(z.string()).optional(),
    isRenovacao: z.enum(['Sim', 'Não']).default('Não'),
    dataInicioVigencia: z.string().optional(),
  });

  return schema.superRefine((data, ctx) => {
    const isPlano100k = data.tipoDePlano === '100k';

    // Se o ramo exige faturamento e não é plano simplificado 100k
    if (ramo.hasFaturamento && !isPlano100k) {
      if (!data.faturamentoAntes || data.faturamentoAntes.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['faturamentoAntes'],
          message: 'Informe o faturamento dos últimos 12 meses.',
        });
      }

      if (!data.faturamentoDepois || data.faturamentoDepois.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['faturamentoDepois'],
          message: 'Informe o faturamento estimado para os próximos 12 meses.',
        });
      }
    }

    // Se o ramo possui especialidades/áreas e não for plano simplificado 100k
    if (ramo.especialidades && ramo.especialidades.length > 0 && !isPlano100k) {
      const hasEspecialidades = (data.especialidades && data.especialidades.length > 0) ||
                                (data.atuacao && data.atuacao.length > 0);
      if (!hasEspecialidades) {
        ctx.addIssue({
          code: 'custom',
          path: ['especialidades'],
          message: `Selecione ao menos uma área/especialidade em ${ramo.especialidadesLabel || 'Especialidades'}.`,
        });
      }
    }

    // Se for PPE (Pessoa Politicamente Exposta), exige a seleção de ao menos um cargo ocupado
    if (ramo.hasPpe && (data.ppeCargos === 'Sim' || data.ppeRepresenta === 'Sim')) {
      if (!data.ppeCargoSelect || data.ppeCargoSelect.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['ppeCargoSelect'],
          message: 'Selecione ao menos uma função/cargo público de PPE.',
        });
      }
    }
  });
}

/**
 * Constrói o esquema de validação do Passo 4: Declarações de Risco (Underwriting) e Seguro Anterior.
 */
export function buildRamoStep4Schema(ramo: RamoConfig) {
  // Construção dinâmica das perguntas de risco do ramo
  const questionShape: Record<string, z.ZodTypeAny> = {
    tipoDePlano: z.string().optional(),
    isRenovacao: z.enum(['Sim', 'Não']).default('Não'),
    seguradora: z.string().optional(),
    vigencia: z.string().optional(),
    limite: z.string().optional(),
    franquiaAnterior: z.string().optional(),
    premio: z.string().optional(),
    dataRetroativa: z.string().optional(),
  };

  for (const q of ramo.questionarioRisco) {
    questionShape[q.id] = z.enum(['Sim', 'Não']).default('Não');
    questionShape[q.detailKey] = z.string().optional();
  }

  const baseSchema = z.object(questionShape).passthrough();

  return baseSchema.superRefine((data: Record<string, any>, ctx) => {
    const isPlano100k = data.tipoDePlano === '100k';

    // Validação de seguro anterior em caso de renovação
    if (data.isRenovacao === 'Sim') {
      if (!data.seguradora || String(data.seguradora).trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['seguradora'],
          message: 'Informe a seguradora da apólice anterior para renovação.',
        });
      }
      if (!data.vigencia || String(data.vigencia).trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['vigencia'],
          message: 'Informe a data de vigência da apólice anterior.',
        });
      }
      if (!data.limite || String(data.limite).trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['limite'],
          message: 'Informe o limite de cobertura do seguro anterior.',
        });
      }
    }

    // Se o plano for 100k em RC Advogados, o questionário simplificado não exige detalhes
    if (isPlano100k && ramo.ramoId === 'rc-advogados') {
      return;
    }

    // Valida cada pergunta de risco do questionário declarativo
    for (const q of ramo.questionarioRisco) {
      const answer = data[q.id];
      const detail = data[q.detailKey];

      if (answer === 'Sim' && q.requiredOnAffirmative !== false) {
        if (!detail || String(detail).trim().length < 5) {
          ctx.addIssue({
            code: 'custom',
            path: [q.detailKey],
            message: `Descreva detalhadamente as informações para: "${q.question}"`,
          });
        }
      }
    }
  });
}

/**
 * Construtor Mestre do Esquema Zod Integral para qualquer Ramo de Seguro.
 * Valida o formulário de ponta a ponta garantindo conformidade com as regras
 * específicas daquele ramo de seguro.
 */
export function buildRamoZodSchema(ramo: RamoConfig) {
  const step1 = buildRamoStep1Schema(ramo);
  const step2 = buildRamoStep2Schema(ramo);
  const step3 = buildRamoStep3Schema(ramo);
  const step4 = buildRamoStep4Schema(ramo);

  // Esquema Zod que orquestra a validação sequencial de todos os passos
  return z
    .record(z.string(), z.any())
    .superRefine((data: Record<string, any>, ctx) => {
      const formData = data as MultiRamoFormState;

      // 1. Valida Passo 1 (Plano e Parcela)
      const p1Result = step1.safeParse(formData);
      if (!p1Result.success) {
        for (const issue of p1Result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: issue.path as (string | number)[],
            message: issue.message,
          });
        }
      }

      // 2. Valida Passo 2 (Segurado, Endereço e Registro de Classe)
      const p2Result = step2.safeParse(formData);
      if (!p2Result.success) {
        for (const issue of p2Result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: issue.path as (string | number)[],
            message: issue.message,
          });
        }
      }

      // 3. Valida Passo 3 (Perfil Profissional, Áreas e PPE)
      const p3Result = step3.safeParse(formData);
      if (!p3Result.success) {
        for (const issue of p3Result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: issue.path as (string | number)[],
            message: issue.message,
          });
        }
      }

      // 4. Valida Passo 4 (Underwriting e Questionário de Risco)
      const p4Result = step4.safeParse(formData);
      if (!p4Result.success) {
        for (const issue of p4Result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: issue.path as (string | number)[],
            message: issue.message,
          });
        }
      }
    });
}
