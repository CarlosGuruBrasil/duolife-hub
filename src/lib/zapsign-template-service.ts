import { getZapSignConfig, sanitizeApiToken, DEFAULT_ZAPSIGN_TEMPLATES, ZapSignConfig } from './system-settings';
import { logger } from './logger';
import { parseAtuacaoList } from './atuacao';
import { calculatePolicyExpiryDate } from './format';
import { parseVigenciaDate } from './insurance-ops';

export type TipoContratoZapSign = '100k' | 'renovacao' | '100k_renovacao' | 'oficial';

export interface ZapSignTemplateResolution {
  templateId: string;
  tipoContrato: TipoContratoZapSign;
  isRenovacao: boolean;
  is100k: boolean;
}

export interface ZapSignTemplateDocResponse {
  ok: boolean;
  docToken: string;
  signUrl: string;
  signUrlProponente: string;
  signers?: Array<{
    token: string;
    name: string;
    email: string;
    signUrl: string;
    status: string;
  }>;
  rawPayload: any;
  error?: string;
}

/**
 * Normaliza valores booleanos ou respostas em formato de texto para 'Sim' ou 'Não'.
 */
export function resolveSimNao(...candidates: unknown[]): 'Sim' | 'Não' {
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (raw === true || raw === 1) return 'Sim';
    if (raw === false || raw === 0) return 'Não';
    const norm = String(raw)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (!norm) continue;
    if (norm === 'sim' || norm === 's' || norm === 'true' || norm === '1' || norm === 'yes' || norm === 'y') {
      return 'Sim';
    }
    if (norm === 'nao' || norm === 'n' || norm === 'false' || norm === '0' || norm === 'no') {
      return 'Não';
    }
  }
  return 'Não';
}

/**
 * Retorna detalhe se a resposta for 'Sim', ou espaço vazio se 'Não'.
 */
export function resolveDetalhe(resposta: 'Sim' | 'Não', ...candidates: unknown[]): string {
  if (resposta !== 'Sim') return ' ';
  for (const raw of candidates) {
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      return String(raw).trim();
    }
  }
  return ' ';
}

/**
 * Formata CPF ou CNPJ com pontuação padrão.
 */
export function formatarCpfCnpj(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return String(raw);
}

/**
 * Formata moeda para padrão brasileiro BRL (R$ 1.234,56).
 */
export function formatarMoeda(val: unknown): string {
  if (typeof val === 'number') {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (typeof val === 'string') {
    const limpo = val.replace('R$', '').trim();
    if (limpo.includes(',')) {
      const num = parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(num)) {
        return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      }
    }
    const num = parseFloat(limpo);
    if (Number.isFinite(num)) {
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
  }
  return 'R$ 0,00';
}

/**
 * Formata data ISO (ou Date) para DD/MM/AAAA imune a timezone offsets.
 */
export function formatarDataBr(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const str = val.trim();
    if (str.includes('/')) return str;
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, ano, mes, dia] = match;
      return `${dia}/${mes}/${ano}`;
    }
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const dia = String(val.getDate()).padStart(2, '0');
    const mes = String(val.getMonth() + 1).padStart(2, '0');
    const ano = val.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Determina qual dos 3 modelos de minuta da ZapSign (Template IDs) deve ser utilizado:
 * 1. Template Renovação (3718fe53-33f1-47c6-80c3-d7adccc09db7) -> para qualquer renovação
 * 2. Template Plano 100k (22efcc24-aa53-4c84-9946-e81ef2e0c197) -> para o plano 100k novo
 * 3. Template Oficial Padrão (0ba7013e-3550-4f1d-92d8-2582810a3a9e) -> para 300k, 500k, etc.
 */
export function determinarTemplateZapSignNet4Life(
  clientData: Record<string, any>,
  cotacao?: {
    is_renewal?: boolean | null;
    importancia_segurada?: number | string | null;
    [key: string]: any;
  },
  zapConfig?: ZapSignConfig
): ZapSignTemplateResolution {
  const isRenovacao =
    resolveSimNao(clientData.isRenovacao) === 'Sim' ||
    resolveSimNao(clientData.renovacao) === 'Sim' ||
    resolveSimNao(clientData.isRenewal) === 'Sim' ||
    Boolean(cotacao?.is_renewal) ||
    String(clientData.tipo || clientData.tipoDePlano || clientData.plano || '').toLowerCase().includes('renov');

  const tipoNorm = String(
    clientData.tipo || clientData.tipoDePlano || clientData.plano || clientData.nomePlano || ''
  ).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const coberturaStr = String(
    clientData.cobertura || clientData.lmi || clientData.valorCobertura || cotacao?.importancia_segurada || ''
  ).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const cleanNumber = Number(coberturaStr.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.'));
  const coberturaDigits = coberturaStr.replace(/\D/g, '');

  const is100k =
    tipoNorm.includes('100k') ||
    tipoNorm.includes('100 mil') ||
    tipoNorm.includes('100mil') ||
    tipoNorm.includes('100.000') ||
    tipoNorm === '100' ||
    tipoNorm.includes('plano 100') ||
    coberturaStr.includes('100.000') ||
    coberturaStr.includes('100 mil') ||
    coberturaStr.includes('100mil') ||
    cleanNumber === 100000 ||
    coberturaDigits === '100000' ||
    coberturaDigits === '10000000' ||
    Number(cotacao?.importancia_segurada) === 100000;

  const tplRenovacao = zapConfig?.templateRenovacao || DEFAULT_ZAPSIGN_TEMPLATES.RENOVACAO;
  const tpl100k = zapConfig?.template100k || DEFAULT_ZAPSIGN_TEMPLATES.PLANO_100K;
  const tplOficial = zapConfig?.templateOficial || DEFAULT_ZAPSIGN_TEMPLATES.OFICIAL;

  if (isRenovacao) {
    return {
      templateId: tplRenovacao,
      tipoContrato: is100k ? '100k_renovacao' : 'renovacao',
      isRenovacao: true,
      is100k,
    };
  }

  if (is100k) {
    return {
      templateId: tpl100k,
      tipoContrato: '100k',
      isRenovacao: false,
      is100k: true,
    };
  }

  return {
    templateId: tplOficial,
    tipoContrato: 'oficial',
    isRenovacao: false,
    is100k: false,
  };
}

/**
 * Monta o conjunto completo de tokens/variáveis esperados pelas minutas ZapSign da Net4Life.
 */
export function montarVariaveisTemplateZapSign(
  clientData: Record<string, any>,
  cotacao: {
    id: string;
    client_name: string;
    client_cpf_cnpj: string;
    client_email?: string | null;
    client_phone?: string | null;
    premio_final?: number | string | null;
    created_at?: string | Date | null;
    [key: string]: any;
  },
  options: {
    ppeDescricao?: string;
    corretoraInfo?: any;
    valorTotal?: number;
    qtdParcelas?: number;
    valorParcela?: number;
  } = {}
): { variaveis: Record<string, string>; dataArray: Array<{ de: string; para: string }> } {
  const hoje = new Date();
  const dia = String(hoje.getDate());
  const mes = hoje.toLocaleString('pt-BR', { month: 'long' });
  const ano = String(hoje.getFullYear());

  const ppeDescricao = options.ppeDescricao || '';
  const corretoraInfo = options.corretoraInfo || {
    cidade: 'Florianópolis',
    nomeFantasia: 'NET4LIFE CORRETORA DE SEGUROS',
  };

  const valorTotal = options.valorTotal ?? Number(cotacao.premio_final || clientData.valor || clientData.valorTotal || 0);
  const qtdParcelas = options.qtdParcelas ?? Math.max(1, Number(clientData.parcela || clientData.parcelas || 1));
  const valorParcela = options.valorParcela ?? (qtdParcelas > 1 ? Number((valorTotal / qtdParcelas).toFixed(2)) : valorTotal);

  // Endereço completo formatado
  const enderecoFormatadoProponente = clientData.endereco || [
    clientData.logradouro,
    clientData.numero ? `nº ${clientData.numero}` : null,
    clientData.complemento ? `(${clientData.complemento})` : null,
    clientData.bairro ? `Bairro ${clientData.bairro}` : null,
    clientData.cidade && clientData.uf ? `${clientData.cidade}/${clientData.uf}` : (clientData.cidade || clientData.uf),
    clientData.cep ? `CEP: ${clientData.cep}` : null,
  ].filter(Boolean).join(', ') || 'Não informado';

  // Áreas de atuação
  const areaAtuacao = parseAtuacaoList(clientData.atuacao || clientData.especialidades);
  const checkArea = (name: string) => areaAtuacao.includes(name) ? 'X' : ' ';

  // Questionário de risco
  const questionarioRisco = (clientData.questionarioRisco && typeof clientData.questionarioRisco === 'object'
    ? clientData.questionarioRisco
    : {}) as Record<string, any>;

  const propostaRecusada = resolveSimNao(clientData.propostaRecusada, questionarioRisco.propostaRecusada);
  const reclamacaoProfissional = resolveSimNao(clientData.reclamacaoProfissional, questionarioRisco.reclamacaoProfissional);
  const investigacaoAutoridade = resolveSimNao(clientData.investigacaoAutoridade, questionarioRisco.investigacaoAutoridade);
  const fatoTerceiros = resolveSimNao(clientData.fatoTerceiros, questionarioRisco.fatoTerceiros);
  const pagouReclamacao = resolveSimNao(clientData.pagouReclamacao, questionarioRisco.pagouReclamacao);

  // Vigência
  const rawInicioVigencia =
    clientData.dataInicioVigencia ||
    clientData.dataVigencia ||
    clientData.inicioVigencia ||
    (cotacao.created_at ? new Date(cotacao.created_at).toISOString().slice(0, 10) : null);
  const inicioVigenciaIso = parseVigenciaDate(rawInicioVigencia) || hoje.toISOString().slice(0, 10);
  const fimVigenciaIso = calculatePolicyExpiryDate(inicioVigenciaIso);
  const vigenciaPeriodoTexto = `${formatarDataBr(inicioVigenciaIso)} a ${formatarDataBr(fimVigenciaIso)} (1 ano)`;

  const isRenovacaoBool =
    resolveSimNao(clientData.isRenovacao) === 'Sim' ||
    resolveSimNao(clientData.renovacao) === 'Sim' ||
    resolveSimNao(clientData.isRenewal) === 'Sim' ||
    Boolean(cotacao.is_renewal);

  const valorFranquiaPlano = clientData.planoFranquia || clientData.franquia || 'R$ 1.000,00';

  // Montagem do dicionário de variáveis
  const variaveis: Record<string, string> = {
    // Proponente / Dados Pessoais
    nome: cotacao.client_name,
    nome_cliente: cotacao.client_name,
    email: cotacao.client_email || '',
    celular: cotacao.client_phone || '',
    cpf: formatarCpfCnpj(cotacao.client_cpf_cnpj),
    oab: clientData.oab || clientData.registroProfissionalNumero || clientData.registroProfissional || '',
    dataNascto: formatarDataBr(clientData.dataNascto || clientData.nascimento || clientData.dataNascimento),
    nascimento: formatarDataBr(clientData.dataNascto || clientData.nascimento || clientData.dataNascimento),

    // Endereço
    endereco: enderecoFormatadoProponente,
    endereco_completo: enderecoFormatadoProponente,
    logradouro: clientData.logradouro || '',
    numero: String(clientData.numero ?? ''),
    complemento: clientData.complemento || '',
    cep: clientData.cep || '',
    bairro: clientData.bairro || '',
    cidade: clientData.cidade || '',
    uf: clientData.uf || '',
    lgpd: 'X',

    // Dados Profissionais
    inicioProfissional: formatarDataBr(clientData.dataAtividade || clientData.inicioProfissional),
    inicio_profissional: formatarDataBr(clientData.dataAtividade || clientData.inicioProfissional),
    escritorio: clientData.associadoEscritorio === 'Sim'
      ? (clientData.nomeEscritorio || clientData.escritorioAssociado || clientData.escritorio || '')
      : (clientData.escritorioAssociado && clientData.escritorioAssociado !== 'Não associado' && clientData.escritorioAssociado !== 'Não'
          ? clientData.escritorioAssociado
          : 'Não associado'),
    escritorio_associado: clientData.associadoEscritorio === 'Sim'
      ? (clientData.nomeEscritorio || clientData.escritorioAssociado || clientData.escritorio || '')
      : (clientData.escritorioAssociado && clientData.escritorioAssociado !== 'Não associado' && clientData.escritorioAssociado !== 'Não'
          ? clientData.escritorioAssociado
          : 'Não associado'),
    titularidade: clientData.titularidade || '',
    faturamentoAntes: clientData.faturamentoAntes || clientData.faturamentoAnterior || clientData.fat12Meses || clientData.faturamento_ultimos || 'Não informado',
    faturamentoDepois: clientData.faturamentoDepois || clientData.faturamentoProximo || clientData.fatEstimado || clientData.faturamento_proximos || 'Não informado',
    faturamento_ultimos: clientData.faturamentoAntes || clientData.faturamentoAnterior || clientData.fat12Meses || clientData.faturamento_ultimos || 'Não informado',
    faturamento_proximos: clientData.faturamentoDepois || clientData.faturamentoProximo || clientData.fatEstimado || clientData.faturamento_proximos || 'Não informado',

    // Áreas de Atuação
    civil: checkArea('civil'),
    propriedadeIndustrial: checkArea('propriedadeIndustrial'),
    industrial: checkArea('propriedadeIndustrial'),
    bancarioFinanceiro: checkArea('bancarioFinanceiro'),
    financeiro: checkArea('bancarioFinanceiro'),
    criminal: checkArea('criminal'),
    tributaria: checkArea('tributaria'),
    tributario: checkArea('tributaria'),
    previdenciario: checkArea('previdenciario'),
    direitoInternacional: checkArea('direitoInternacional'),
    internacional: checkArea('direitoInternacional'),
    fusoesAquisicoes: checkArea('fusoesAquisicoes'),
    fusoes: checkArea('fusoesAquisicoes'),
    direitoEmpresarial: checkArea('direitoEmpresarial'),
    empresarial: checkArea('direitoEmpresarial'),
    trabalhista: checkArea('trabalhista'),
    societario: checkArea('societario'),
    outros: checkArea('outros'),

    // PPE (Pessoa Politicamente Exposta)
    ppeCargos: resolveSimNao(clientData.ppeCargos, clientData.ppe, clientData.tem_cargos),
    tem_cargos: resolveSimNao(clientData.ppeCargos, clientData.ppe, clientData.tem_cargos),
    ppeRepresenta: resolveSimNao(clientData.ppeRepresenta, clientData.ppeRelacionado, clientData.representante_legal),
    representante_legal: resolveSimNao(clientData.ppeRepresenta, clientData.ppeRelacionado, clientData.representante_legal),
    ppeCargoSelect: ppeDescricao || ' ',
    cargos_ppe: ppeDescricao || ' ',

    // Vigência do Seguro
    vigencia: vigenciaPeriodoTexto,
    vigencia_seguro: vigenciaPeriodoTexto,
    vigencia_periodo: vigenciaPeriodoTexto,
    inicio_vigencia: formatarDataBr(inicioVigenciaIso),
    fim_vigencia: formatarDataBr(fimVigenciaIso),

    // Seguro Anterior (Renovação)
    seguradora: isRenovacaoBool ? (clientData.seguradora || 'Não informada') : 'Não se aplica',
    limite: isRenovacaoBool ? (clientData.limite || clientData.lmiAnterior || 'Não informado') : 'Não se aplica',
    vigencia_anterior: isRenovacaoBool ? (formatarDataBr(clientData.vigenciaAnterior || clientData.vigencia) || 'Não informada') : 'Não se aplica',
    vigencia_apolice_atual: isRenovacaoBool ? (formatarDataBr(clientData.vigenciaAnterior || clientData.vigencia) || 'Não informada') : 'Não se aplica',
    premio: isRenovacaoBool ? (clientData.premio || 'Não informado') : 'Não se aplica',
    dataRetroativa: isRenovacaoBool ? (clientData.dataRetroativa ? formatarDataBr(clientData.dataRetroativa) : formatarDataBr(hoje)) : 'Início de Vigência',
    franquiaAnterior: isRenovacaoBool ? (clientData.franquiaAnterior || 'Não informada') : 'Não se aplica',

    // Questionário de Risco
    propostaRecusada: propostaRecusada,
    proposta_recusada: propostaRecusada,
    propostaDetalhe: resolveDetalhe(propostaRecusada, clientData.propostaDetalhe, questionarioRisco.propostaDetalhe),
    reclamacaoProfissional: reclamacaoProfissional,
    reclamacoes: reclamacaoProfissional,
    reclamacaoDetalhe: resolveDetalhe(reclamacaoProfissional, clientData.reclamacaoDetalhe, questionarioRisco.reclamacaoDetalhe),
    investigacaoAutoridade: investigacaoAutoridade,
    acao_disciplinar: investigacaoAutoridade,
    investigacaoDetalhe: resolveDetalhe(investigacaoAutoridade, clientData.investigacaoDetalhe, questionarioRisco.investigacaoDetalhe),
    fatoTerceiros: fatoTerceiros,
    reclamacao_terceiros: fatoTerceiros,
    fatoDetalhe: resolveDetalhe(fatoTerceiros, clientData.fatoDetalhe, questionarioRisco.fatoDetalhe),
    pagouReclamacao: pagouReclamacao,
    fundos_proprios: pagouReclamacao,
    pagouDetalhe: resolveDetalhe(pagouReclamacao, clientData.pagouDetalhe, questionarioRisco.pagouDetalhe),

    // Corretora
    cidadeCorretora: corretoraInfo.cidade || 'Florianópolis',
    corretora: corretoraInfo.nomeFantasia || 'NET4LIFE CORRETORA DE SEGUROS',

    // Condições Comerciais
    tipo: clientData.valorCobertura || clientData.tipoDePlano || clientData.plano || 'Plano Padrão',
    valor: formatarMoeda(valorTotal),
    valorTotalParcelado: formatarMoeda(valorTotal),
    planoParcela: qtdParcelas > 1 ? `${qtdParcelas} parcelas` : '1x',
    planoValorParcela: formatarMoeda(valorParcela),
    franquia: valorFranquiaPlano,
    planoFranquia: valorFranquiaPlano,

    // Data Atual
    dia: dia,
    mes: mes,
    ano: ano,
  };

  // Higienização completa de valores (converte nulo/undefined/vazio para ' ')
  const dataArray: Array<{ de: string; para: string }> = Object.entries(variaveis).map(([de, rawValor]) => {
    let valor = rawValor;
    if (valor === undefined || valor === null || valor === '' || valor === 'undefined' || valor === 'null') {
      valor = ' ';
    }
    return {
      de,
      para: String(valor),
    };
  });

  return { variaveis, dataArray };
}

/**
 * Cria o documento na ZapSign utilizando a API oficial de Modelos (/models/create-doc/).
 * Garante que NENHUM PDF seja gerado ou transmitido pelo servidor.
 */
export async function criarDocumentoZapSignPorModelo(params: {
  templateId: string;
  signerName: string;
  signerEmail: string;
  externalId: string;
  deadlineAt?: string;
  dataArray: Array<{ de: string; para: string }>;
  zapConfig?: ZapSignConfig;
}): Promise<ZapSignTemplateDocResponse> {
  const zapConfig = params.zapConfig || (await getZapSignConfig());
  const token = sanitizeApiToken(zapConfig.apiToken);
  const baseUrl = zapConfig.baseUrl;

  if (!token) {
    throw new Error('Token da API ZapSign não configurado nas configurações de sistema.');
  }

  const deadlineZapSign =
    params.deadlineAt ||
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const payload = {
    template_id: params.templateId,
    signer_name: params.signerName,
    signer_email: params.signerEmail || 'suporte@duolife.net.br',
    send_automatic_email: false,
    send_automatic_whatsapp: false,
    sandbox: zapConfig.isSandbox,
    lang: 'pt-br',
    deadline_at: deadlineZapSign,
    data: params.dataArray,
    external_id: params.externalId,
  };

  logger.info(
    {
      templateId: params.templateId,
      signerName: params.signerName,
      signerEmail: params.signerEmail,
      externalId: params.externalId,
      tokensCount: params.dataArray.length,
      isSandbox: zapConfig.isSandbox,
    },
    'zapsign_template.create_doc.request'
  );

  const response = await fetch(`${baseUrl}/models/create-doc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(
      { status: response.status, body: responseText, templateId: params.templateId, externalId: params.externalId },
      'zapsign_template.create_doc.failed'
    );
    let errorMsg = responseText;
    try {
      const jsonErr = JSON.parse(responseText);
      errorMsg = jsonErr.detail || jsonErr.message || responseText;
    } catch (_) {}

    if (responseText.includes('API token not found') || responseText.includes('Token da API não encontrado')) {
      const ambAtual = zapConfig.isSandbox ? 'Sandbox (Testes)' : 'Produção Real';
      errorMsg = `Falha de autenticação na ZapSign: O Token de API informado não foi localizado no ambiente ${ambAtual}.`;
    }

    throw new Error(`Falha na API da ZapSign (/models/create-doc/): ${errorMsg}`);
  }

  const resJson = JSON.parse(responseText);
  const docToken = resJson.token || resJson.doc_token;

  if (!docToken) {
    logger.error({ body: responseText }, 'zapsign_template.create_doc.missing_token');
    throw new Error('Resposta da ZapSign não continha o token do documento criado via modelo.');
  }

  const signersList = (resJson.signers || []).map((s: any) => ({
    token: s.token || '',
    name: s.name || '',
    email: s.email || '',
    signUrl: s.sign_url || '',
    status: s.status || 'pending',
  }));

  const signUrl = signersList[0]?.signUrl || resJson.sign_url || '';

  return {
    ok: true,
    docToken,
    signUrl,
    signUrlProponente: signUrl,
    signers: signersList,
    rawPayload: resJson,
  };
}
