import { RamoConfig, GrupoTarifarioOption, PlanoDefinition } from '../types';

/**
 * Grupos Tarifários Oficiais da Saúde (G1 a G8).
 * Permite tarifação dinâmica por categoria profissional e especialidade médica.
 */
export const GRUPOS_TARIFARIOS_SAUDE: GrupoTarifarioOption[] = [
  {
    id: 'G1',
    codigo: 'outros_profissionais_saude',
    label: 'G1: Outros profissionais da saúde, exceto médicos',
    description: 'Fisioterapeutas, biomédicos, nutricionistas, fonoaudiólogos, psicólogos, terapeutas ocupacionais e enfermeiros.',
    registroKey: 'registroProfissionalNumero',
    registroLabel: 'Registro no Conselho de Classe (CREFITO, CRN, etc.)',
    registroPlaceholder: 'Ex: 12345-F',
    isCirurgico: false,
  },
  {
    id: 'G2',
    codigo: 'dentistas',
    label: 'G2: Dentistas',
    description: 'Cirurgiões-dentistas, implantodontistas, ortodontistas, endodontistas e odontologia estética.',
    registroKey: 'cro',
    registroLabel: 'Inscrição CRO',
    registroPlaceholder: 'Ex: 12345',
    isCirurgico: true,
  },
  {
    id: 'G3',
    codigo: 'residente_medico_geral',
    label: 'G3: Residente médico, exceto Ginecologia e Obstetrícia e Cirurgia Plástica',
    description: 'Médicos residentes em programas de formação/especialização clínica e cirúrgica geral.',
    registroKey: 'crm',
    registroLabel: 'Inscrição CRM',
    registroPlaceholder: 'Ex: 123456',
    isCirurgico: false,
  },
  {
    id: 'G4',
    codigo: 'residente_medico_go',
    label: 'G4: Residente médico — Ginecologia e Obstetrícia',
    description: 'Médicos residentes atuando em programas de residência médica de Ginecologia e Obstetrícia.',
    registroKey: 'crm',
    registroLabel: 'Inscrição CRM',
    registroPlaceholder: 'Ex: 123456',
    isCirurgico: true,
  },
  {
    id: 'G5',
    codigo: 'medico_sem_cirurgia',
    label: 'G5: Demais especialidades médicas sem cirurgia',
    description: 'Médicos clínicos gerais, pediatras, dermatologia clínica, cardiologia, psiquiatria, endocrinologia, etc.',
    registroKey: 'crm',
    registroLabel: 'Inscrição CRM',
    registroPlaceholder: 'Ex: 123456',
    isCirurgico: false,
  },
  {
    id: 'G6',
    codigo: 'medico_com_cirurgia',
    label: 'G6: Demais especialidades médicas com cirurgia',
    description: 'Cirurgiões gerais, ortopedistas, anestesiologistas, urologistas, oftalmologistas cirúrgicos, etc.',
    registroKey: 'crm',
    registroLabel: 'Inscrição CRM',
    registroPlaceholder: 'Ex: 123456',
    isCirurgico: true,
  },
  {
    id: 'G7',
    codigo: 'ginecologia_obstetricia',
    label: 'G7: Ginecologia e Obstetrícia',
    description: 'Médicos especialistas com atuação em obstetrícia, partos e cirurgias ginecológicas.',
    registroKey: 'crm',
    registroLabel: 'Inscrição CRM',
    registroPlaceholder: 'Ex: 123456',
    isCirurgico: true,
  },
  {
    id: 'G8',
    codigo: 'cirurgiao_plastico',
    label: 'G8: Cirurgião plástico',
    description: 'Médicos cirurgiões plásticos atuantes em cirurgia plástica estética e reconstrutora com RQE.',
    registroKey: 'crm',
    registroLabel: 'Inscrição CRM',
    registroPlaceholder: 'Ex: 123456',
    isCirurgico: true,
  },
];

/**
 * Constrói a grade de planos da saúde (250k, 500k e 1M) para um multiplicador de grupo.
 * Estrutura modular preparada para receber a matriz final de valores da seguradora.
 */
function buildGradePlanosSaude(multiplicador: number): PlanoDefinition[] {
  const base250k = Math.round(1800 * multiplicador);
  const base500k = Math.round(3100 * multiplicador);
  const base1M = Math.round(5200 * multiplicador);

  function parcelar(total: number) {
    return {
      parcela: `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      parcela2X: `R$ ${(total / 2).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      parcela3X: `R$ ${(total / 3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      parcela4X: `R$ ${(total / 4).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      parcela5X: `R$ ${(total / 5).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      parcela6X: `R$ ${(total / 6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      valorPagoKovr: Math.round(total * 0.65),
      maxParcelas: 6,
    };
  }

  return [
    {
      tipoDePlano: '250k',
      nomeExibido: 'Plano 250 Mil',
      cobertura: 'R$ 250.000,00',
      franquia: 'R$ 2.500,00',
      ordem: 1,
      ...parcelar(base250k),
    },
    {
      tipoDePlano: '500k',
      nomeExibido: 'Plano 500 Mil',
      cobertura: 'R$ 500.000,00',
      franquia: 'R$ 5.000,00',
      ordem: 2,
      ...parcelar(base500k),
    },
    {
      tipoDePlano: '1M',
      nomeExibido: 'Plano 1 Milhão',
      cobertura: 'R$ 1.000.000,00',
      franquia: 'R$ 10.000,00',
      ordem: 3,
      ...parcelar(base1M),
    },
  ];
}

/**
 * Matriz de Planos da Saúde por Grupo Tarifário (G1 a G8).
 * Quando a tabela final de prêmios da seguradora for enviada,
 * basta ajustar os valores diretamente nesta matriz.
 */
export const PLANOS_SAUDE_POR_GRUPO: Record<string, PlanoDefinition[]> = {
  G1: buildGradePlanosSaude(0.70), // Outros profissionais de saúde
  G2: buildGradePlanosSaude(0.85), // Dentistas
  G3: buildGradePlanosSaude(0.75), // Residente geral
  G4: buildGradePlanosSaude(1.10), // Residente GO
  G5: buildGradePlanosSaude(1.00), // Médicos sem cirurgia (Referência Base)
  G6: buildGradePlanosSaude(1.40), // Médicos com cirurgia
  G7: buildGradePlanosSaude(1.75), // Ginecologia e Obstetrícia
  G8: buildGradePlanosSaude(2.10), // Cirurgia Plástica
};

/**
 * Configuração declarativa do Seguro de Responsabilidade Civil Profissional para
 * Médicos & Profissionais da Saúde (Médicos, Dentistas, Fisioterapeutas e profissionais afins).
 */
export const rcMedicosConfig: RamoConfig = {
  ramoId: 'rc-medicos',
  name: 'RC Profissional — Médicos & Profissionais da Saúde',
  shortName: 'RC Saúde',
  category: 'responsabilidade_civil',
  flowKeys: ['rc_medicos_v1'],
  pricingStrategy: 'rc_medicos_planos_v1',
  policyPrefix: 'DL-RC-MED',
  targetAudience: 'Médicos pessoa física, plantonistas, cirurgiões, dentistas, residentes e demais profissionais da saúde.',

  registroProfissional: {
    key: 'crm',
    label: 'Inscrição CRM',
    placeholder: 'Ex: 123456',
    ufKey: 'crmUf',
    required: true,
    hasRqe: true,
  },

  associacaoProfissional: {
    enabled: true,
    label: 'O profissional é associado a alguma clínica ou hospital? *',
    sublabel: 'Esta informação constará no contrato emitido e na apólice de seguro.',
    inputLabel: 'Nome da Clínica ou Hospital *',
    inputPlaceholder: 'Ex: Hospital São Lucas, Clínica Vida & Saúde, etc.',
    inputHelpText: 'Informe a razão social ou nome comercial da clínica, consultório ou hospital ao qual atua associado.',
    errorMessage: 'Por favor, informe o nome da clínica ou hospital ao qual o profissional é associado.',
  },

  gruposTarifariosLabel: 'Selecione a Categoria Profissional / Especialidade de Saúde',
  gruposTarifarios: GRUPOS_TARIFARIOS_SAUDE,
  planosPorGrupo: PLANOS_SAUDE_POR_GRUPO,

  especialidadesLabel: 'Especialidades Médicas (Clínicas e Cirúrgicas)',
  especialidades: [
    { key: 'clinicaGeral', label: 'Clínica Médica / Medicina de Família', description: 'Atendimento ambulatorial clínico geral' },
    { key: 'cirurgiaGeral', label: 'Cirurgia Geral', description: 'Cirurgia geral e videolaparoscopia' },
    { key: 'ginecologiaObstetricia', label: 'Ginecologia e Obstetrícia', description: 'Consultório, partos e cirurgias ginecológicas' },
    { key: 'pediatria', label: 'Pediatria e Puericultura', description: 'Saúde infantil, neonatal e hebiatria' },
    { key: 'anestesiologia', label: 'Anestesiologia', description: 'Anestesia geral, regional e sedação consciente' },
    { key: 'dermatologia', label: 'Dermatologia & Procedimentos', description: 'Clínica dermatológica, biópsias e procedimentos estéticos' },
    { key: 'ortopediaTraumatologia', label: 'Ortopedia e Traumatologia', description: 'Traumatologia cirúrgica e reabilitação músculo-esquelética' },
    { key: 'oftalmologia', label: 'Oftalmologia', description: 'Clínica oftalmológica e cirurgias refrativas/catarata' },
    { key: 'cardiologia', label: 'Cardiologia & Hemodinâmica', description: 'Consultório, métodos gráficos e hemodinâmica intervencionista' },
    { key: 'cirurgiaPlastica', label: 'Cirurgia Plástica (Reparadora e Estética)', description: 'Procedimentos cirúrgicos plásticos estéticos e reparadores' },
    { key: 'neurologiaNeurocirurgia', label: 'Neurologia e Neurocirurgia', description: 'Tratamento clínico e cirúrgico do sistema nervoso central' },
    { key: 'psiquiatria', label: 'Psiquiatria & Saúde Mental', description: 'Psiquiatria clínica e psicoterapia médica' },
    { key: 'radiologiaDiagnostico', label: 'Radiologia e Diagnóstico por Imagem', description: 'Emissão de laudos de TC, RM, ultrassom e raio-x' },
    { key: 'urologia', label: 'Urologia', description: 'Procedimentos urológicos clínicos e cirúrgicos' },
    { key: 'otorrinolaringologia', label: 'Otorrinolaringologia', description: 'Clínica e cirurgias de ouvido, nariz e garganta' },
    { key: 'oncologia', label: 'Oncologia Clínica e Cirúrgica', description: 'Tratamento antineoplásico, quimioterapia e cirurgias oncológicas' },
    { key: 'medicinaIntensiva', label: 'Medicina Intensiva (UTI)', description: 'Manejo de pacientes críticos em unidades de terapia intensiva' },
    { key: 'endocrinologia', label: 'Endocrinologia e Metabologia', description: 'Doenças metabólicas, tireoide e hormonais' },
    { key: 'gastroenterologia', label: 'Gastroenterologia & Endoscopia', description: 'Aparelho digestivo, endoscopia e colonoscopia digestiva' },
    { key: 'outrosMed', label: 'Outras Especialidades Médicas', description: 'Demais especialidades registradas no CFM' },
  ],

  faturamentoLabel: 'Faturamento Bruto Anual de Honorários',
  hasFaturamento: true,
  hasPpe: true,
  requiresUnderwriting: true,

  questionarioRisco: [
    {
      id: 'propostaRecusada',
      question: 'Já teve proposta de seguro de RC Profissional recusada, cancelada ou com recusa de renovação por qualquer seguradora?',
      detailKey: 'propostaDetalhe',
      detailLabel: 'Informe a seguradora, ano e justificativa da recusa',
      requiredOnAffirmative: true,
    },
    {
      id: 'processoConselho',
      question: 'Já foi intimado, respondeu ou responde a sindicância ou Processo Ético-Profissional (PEP) perante o CRM, CRO ou Conselho Profissional?',
      detailKey: 'processoConselhoDetalhe',
      detailLabel: 'Informe o número do processo ético no conselho, UF, objeto da queixa e situação atual',
      requiredOnAffirmative: true,
    },
    {
      id: 'reclamacaoErroMedico',
      question: 'Já sofreu reclamação formal, processo cível de indenização ou inquérito/processo criminal decorrente de suposto erro profissional ou conduta técnica nos últimos 5 anos?',
      detailKey: 'reclamacaoErroMedicoDetalhe',
      detailLabel: 'Descreva a ocorrência, dados da ação judicial, valores pleiteados e fase processual',
      requiredOnAffirmative: true,
    },
    {
      id: 'complicacoesCirurgicas',
      question: 'Nos últimos 3 anos, vivenciou evento adverso grave em seus procedimentos, como óbito perioperatório, infecção de alta complexidade ou complicação irreversível?',
      detailKey: 'complicacoesCirurgicasDetalhe',
      detailLabel: 'Descreva o procedimento realizado, complicação ocorrida e desfecho do paciente',
      requiredOnAffirmative: true,
    },
    {
      id: 'fatoPotencial',
      question: 'Tem ciência de qualquer notificação extrajudicial, reclamação em ouvidoria hospitalar/clínica ou insatisfação manifesta que possa originar processo indenizatório?',
      detailKey: 'fatoPotencialDetalhe',
      detailLabel: 'Detalhe as circunstâncias do caso, paciente envolvido e motivos da insatisfação',
      requiredOnAffirmative: true,
    },
    {
      id: 'pagamentoIndenizacao',
      question: 'Já realizou algum pagamento particular de indenização ou acordo extrajudicial direto com paciente por alegado erro profissional nos últimos 5 anos?',
      detailKey: 'pagamentoIndenizacaoDetalhe',
      detailLabel: 'Informe valores pagos, termos do acordo e procedimento envolvido',
      requiredOnAffirmative: true,
    },
  ],

  // Planos canônicos de referência (Grupo G5 - Médicos sem cirurgia)
  planos: PLANOS_SAUDE_POR_GRUPO['G5'],

  templateZapSignKey: 'rc_medicos_contrato_v1',
};
