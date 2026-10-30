import { sql } from './pg';
import { parseJsonbField } from './json-safe';
import { calcularPrecoServidor } from './pricing';
import { getCorretoraParaContrato, CorretoraContratoInfo } from './corretora-resolver';
import { logger } from './logger';
import {
  convertHtmlToPdf,
  isGotenbergAvailable,
  inlineLocalAssets,
  buildHtmlDocument,
} from './gotenberg-client';
import type { ContractData } from '@/types/contract';
import {
  gerarContratoPdfBuffer,
  determinarTipoContrato,
  type ContratoPdfResult,
  type TipoContratoPdf,
} from './pdf-contract-generator';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatCpf(raw?: string | null): string {
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

function formatMoeda(val: any): string {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const [ano, mes, dia] = val.slice(0, 10).split('-');
      return `${dia}/${mes}/${ano}`;
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

export interface GotenbergContractResult extends ContratoPdfResult {
  engine: 'gotenberg' | 'pdflib_fallback';
}

export interface GerarContratoGotenbergOptions {
  forceFallback?: boolean;
  waitDelayMs?: number;
}

export interface RenderA4SheetParams {
  innerHtml: string;
  corretoraNome?: string;
  corretoraLogoUrl?: string;
  backgroundUrl?: string;
  corretoraEndereco?: string;
  corretoraContato?: string;
  corretoraWebsite?: string;
  corretoraCnpj?: string;
  footerText?: string;
  primaryColor?: string;
}

/**
 * Renderiza o contêiner de folha A4 timbrada oficial com suporte a White-Label dinâmico
 * compatível com o Turbopack do Next.js 16 (sem dependência de react-dom/server).
 */
export function renderA4SheetHtml(params: RenderA4SheetParams): string {
  const bg = params.backgroundUrl || '/images/contrato-kev/kev-background.jpg';
  const cNome = params.corretoraNome || 'Corretora Parceira';
  const cLogo = params.corretoraLogoUrl
    ? `<img src="${params.corretoraLogoUrl}" alt="${cNome}" class="max-h-[36px] max-w-[150px] object-contain" />`
    : `<div class="flex flex-col">
        <span class="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-tight line-clamp-2">${cNome}</span>
        <span class="text-[7.5px] font-semibold text-emerald-800 tracking-wider uppercase">Corretora de Seguros</span>
       </div>`;

  const footerEndereco = params.footerText || params.corretoraEndereco || 'Avenida Brigadeiro Faria Lima, 3477, Torre B, 2º andar. Itaim Bibi, São Paulo - SP, 04538-133';
  const footerContato = [
    params.corretoraWebsite,
    params.corretoraContato,
    params.corretoraCnpj ? `CNPJ: ${params.corretoraCnpj}` : null,
  ].filter(Boolean).join(' • ') || 'kevseguros.com.br';

  return `
    <div class="contract-sheet-root relative w-[210mm] h-[297mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] bg-white text-slate-900 overflow-hidden box-border" style="page-break-after: always; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
      <img src="${bg}" alt="" class="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0" />
      <div class="relative z-10 flex flex-col justify-between h-full px-[14mm] pt-[10mm] pb-[8mm] box-border">
        <!-- CABEÇALHO TIMBRADO -->
        <header class="flex items-center justify-between border-b border-slate-200/60 pb-3 mb-2">
          <div class="flex items-center min-w-[120px] max-w-[200px]">
            ${cLogo}
          </div>
          <div class="flex items-center gap-3.5">
            <div class="flex items-center">
              <img src="/images/contrato-kev/duolife-logo.jpg" alt="DuoLife Hub" class="h-[28px] w-auto object-contain" />
            </div>
            <div class="h-6 w-px bg-slate-300"></div>
            <div class="flex items-center">
              <img src="/images/contrato-kev/kev-logo.jpg" alt="KEV Seguros" class="h-[18px] w-auto object-contain" />
            </div>
          </div>
        </header>

        <!-- CORPO PRINCIPAL DO CONTRATO -->
        <main class="flex-1 flex flex-col justify-start overflow-hidden">
          ${params.innerHtml}
        </main>

        <!-- RODAPÉ INSTITUCIONAL PARCEIRO / CORRETORA / KEV SEGUROS -->
        <footer class="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-center select-none">
          <div class="w-4 h-4 flex items-center justify-center shrink-0">
            <img src="/images/contrato-kev/chevron-left.jpg" alt="" class="h-2.5 w-auto object-contain" />
          </div>
          <div class="flex-1 px-4">
            <p class="text-[6.8px] text-slate-600 font-medium tracking-tight leading-tight">
              ${footerEndereco}
            </p>
            <p class="text-[6.8px] font-bold text-slate-800 tracking-tight leading-tight mt-0.5">
              ${footerContato}
            </p>
          </div>
          <div class="w-4 h-4 flex items-center justify-center shrink-0">
            <img src="/images/contrato-kev/chevron-right.jpg" alt="" class="h-2.5 w-auto object-contain" />
          </div>
        </footer>
      </div>
    </div>
  `;
}

/**
 * Renderiza o corpo interno do Termo de Adesão de RC Advogados em HTML puro
 * com as âncoras da ZapSign ({{assinatura_proponente}} e {{assinatura_corretora}}).
 */
export function renderRcAdvogadoInnerHtml(dados: ContractData): string {
  const pNome = dados.proponente?.nome || 'Dr(a). Não informado';
  const pNasc = dados.proponente?.dataNascimento || 'Não informado';
  const pCpf = dados.proponente?.cpf || 'Não informado';
  const pEmail = dados.proponente?.email || 'Não informado';
  const pCelular = dados.proponente?.celular || 'Não informado';
  const pEndereco = dados.proponente?.endereco || 'Não informado';
  const pInicio = dados.proponente?.inicioProfissional || 'Não informado';
  const pOab = dados.proponente?.oab || 'Não informado';

  const cImportancia = dados.condicoes?.importanciaSegurada || 'R$ 100.000,00';
  const cFranquia = dados.condicoes?.franquia || 'Não há aplicação de franquia';
  const cPremio = dados.condicoes?.valorPremio || 'R$ 790,00';
  const cFormaPag = dados.condicoes?.formaPagamento || '1x à vista';
  const cVigencia = dados.condicoes?.vigencia || '1 ano';
  const cEstipulante = dados.condicoes?.estipulante || 'DUOLIFE PLATAFORMA DE NEGÓCIOS';
  const cCorretora = dados.condicoes?.corretora || dados.corretora?.nomeFantasia || dados.corretora?.nome || 'Corretora Parceira';
  const cSeguradora = dados.condicoes?.seguradora || 'AKAD SEGUROS S.A.';

  const titulo = 'Seguro de Responsabilidade Civil para Advogado';
  const subtitulo = 'Termo de Adesão por parte do Advogado';
  const declaracaoTexto =
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  const cidade = dados.dataCidade?.cidade || dados.corretora?.cidade || 'São Paulo';
  const dia = dados.dataCidade?.dia || new Date().getDate();
  const mes = dados.dataCidade?.mes || MESES[new Date().getMonth()];
  const ano = dados.dataCidade?.ano || new Date().getFullYear();

  return `
    <div class="flex flex-col h-full justify-between gap-2.5 text-slate-800">
      <!-- 1. TÍTULO E SUBTÍTULO -->
      <div class="text-center pt-1 pb-1">
        <h1 class="text-[12px] font-black tracking-tight text-slate-900 uppercase">
          ${titulo}
        </h1>
        <h2 class="text-[9.5px] font-medium text-slate-700 tracking-normal mt-0.5">
          ${subtitulo}
        </h2>
      </div>

      <!-- 2. SEÇÃO PROPONENTE -->
      <section class="w-full">
        <div class="bg-slate-100 border border-slate-300 font-bold px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-slate-900">
          PROPONENTE
        </div>
        <div class="border-x border-b border-slate-300 bg-white text-[8px] flex flex-col">
          <div class="flex border-b border-slate-300">
            <div class="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Nome:
            </div>
            <div class="flex-1 px-2 py-1 font-bold text-slate-900 truncate">
              ${pNome}
            </div>
          </div>
          <div class="flex border-b border-slate-300">
            <div class="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Nascimento:
            </div>
            <div class="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              ${pNasc}
            </div>
            <div class="w-[65px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              CPF:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${pCpf}
            </div>
          </div>
          <div class="flex border-b border-slate-300">
            <div class="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              E-mail:
            </div>
            <div class="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              ${pEmail}
            </div>
            <div class="w-[65px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Celular:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${pCelular}
            </div>
          </div>
          <div class="flex border-b border-slate-300">
            <div class="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Endereço:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${pEndereco}
            </div>
          </div>
          <div class="flex">
            <div class="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Início profissional:
            </div>
            <div class="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              ${pInicio}
            </div>
            <div class="w-[65px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              OAB:
            </div>
            <div class="flex-1 px-2 py-1 font-bold truncate">
              ${pOab}
            </div>
          </div>
        </div>
      </section>

      <!-- 3. SEÇÃO DECLARAÇÃO DO PROPONENTE -->
      <section class="w-full">
        <div class="bg-slate-100 border border-slate-300 font-bold px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-slate-900">
          DECLARAÇÃO DO PROPONENTE
        </div>
        <div class="border-x border-b border-slate-300 bg-white/95 p-2 text-justify text-[7.5px] leading-[1.38] text-slate-800">
          <p>${declaracaoTexto}</p>
        </div>
      </section>

      <!-- 4. SEÇÃO CONDIÇÕES DE COMERCIALIZAÇÃO -->
      <section class="w-full">
        <div class="bg-slate-100 border border-slate-300 font-bold px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-slate-900">
          CONDIÇÕES DE COMERCIALIZAÇÃO
        </div>
        <div class="border-x border-b border-slate-300 bg-white text-[8px] flex flex-col">
          <div class="flex border-b border-slate-300">
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Importância Segurada:
            </div>
            <div class="flex-1 px-2 py-1 font-bold text-slate-900 border-r border-slate-300 truncate">
              ${cImportancia}
            </div>
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Franquia:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${cFranquia}
            </div>
          </div>
          <div class="flex border-b border-slate-300">
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Valor do Prêmio a Pagar:
            </div>
            <div class="flex-1 px-2 py-1 font-bold text-slate-900 border-r border-slate-300 truncate">
              ${cPremio}
            </div>
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Forma de Pagamento:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${cFormaPag}
            </div>
          </div>
          <div class="flex border-b border-slate-300">
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Vigência do Seguro:
            </div>
            <div class="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              ${cVigencia}
            </div>
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Estipulante:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${cEstipulante}
            </div>
          </div>
          <div class="flex">
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Corretora:
            </div>
            <div class="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              ${cCorretora}
            </div>
            <div class="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Seguradora:
            </div>
            <div class="flex-1 px-2 py-1 truncate">
              ${cSeguradora}
            </div>
          </div>
        </div>
      </section>

      <!-- 5. CIDADE E DATA -->
      <div class="text-center pt-2 pb-1">
        <p class="text-[8px] font-medium text-slate-800 tracking-normal">
          ${cidade}, ${dia} de ${mes} de ${ano}
        </p>
      </div>

      <!-- 6. ASSINATURAS ZAPSIGN -->
      <section class="pt-2 pb-1">
        <div class="grid grid-cols-2 gap-12 px-6">
          <div class="flex flex-col items-center text-center">
            <span class="text-[6.5px] text-slate-200 select-none leading-none mb-1 opacity-60" aria-hidden="true">
              {{assinatura_corretora}}
            </span>
            <div class="w-full border-t border-slate-800 mb-1"></div>
            <p class="text-[8.5px] font-bold text-slate-900 leading-tight truncate w-full">
              ${cCorretora}
            </p>
            <p class="text-[7.5px] text-slate-600 leading-tight">Corretora</p>
          </div>
          <div class="flex flex-col items-center text-center">
            <span class="text-[6.5px] text-slate-200 select-none leading-none mb-1 opacity-60" aria-hidden="true">
              {{assinatura_proponente}}
            </span>
            <div class="w-full border-t border-slate-800 mb-1"></div>
            <p class="text-[8.5px] font-bold text-slate-900 leading-tight truncate w-full">
              ${pNome}
            </p>
            <p class="text-[7.5px] text-slate-600 leading-tight">Proponente</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

/**
 * Constrói a estrutura de dados de contrato compatível com o template HTML A4
 * a partir da cotação no PostgreSQL e de sua corretora vinculada.
 */
export async function buildContractDataForQuote(cotacaoId: string): Promise<{
  cotacao: any;
  clientData: Record<string, any>;
  corretora: CorretoraContratoInfo;
  contractData: ContractData;
  tipoContrato: TipoContratoPdf;
  valorTotal: number;
  qtdParcelas: number;
  valorParcela: number;
  docName: string;
}> {
  const [cotacao] = await sql<any[]>`
    SELECT * FROM cotacoes WHERE id = ${cotacaoId} LIMIT 1
  `;
  if (!cotacao) {
    throw new Error(`Cotação não encontrada para o ID ${cotacaoId}`);
  }

  const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);
  const corretora = await getCorretoraParaContrato(cotacao.id);

  const flowKey = clientData.flowKey || cotacao.flow_key || null;
  const productId = clientData.productId || cotacao.product_id || null;
  const grupoTarifario = String(clientData.grupoTarifario || clientData.grupo || '') || null;

  // Recalcula o preço no servidor
  const preco = await calcularPrecoServidor({
    tipoDePlano: clientData.tipo || clientData.tipoDePlano || null,
    qtdParcelasSolicitada: Number(clientData.parcela) || 1,
    cupomCodigo: clientData.cupomCodigo || null,
    descontoManualPercent: Number(clientData.descontoManualPercent ?? clientData.descontoPercentual) || 0,
    flowKey,
    productId,
    grupoTarifario,
  });

  const valorTotal = preco?.valorTotal ?? Number(cotacao.premio_final || cotacao.premio_calculado || 0);
  const qtdParcelas = preco?.qtdParcelas ?? 1;
  const valorParcela = preco?.valorParcela ?? valorTotal;
  const tipoContrato = determinarTipoContrato(clientData, cotacao);

  // Endereço completo formatado
  const enderecoParts = [
    clientData.logradouro || clientData.endereco,
    clientData.numero ? `nº ${clientData.numero}` : null,
    clientData.complemento || null,
    clientData.bairro ? `Bairro ${clientData.bairro}` : null,
    clientData.cidade && clientData.uf ? `${clientData.cidade}/${clientData.uf}` : (clientData.cidade || clientData.uf),
    clientData.cep ? `CEP: ${clientData.cep}` : null,
  ].filter(Boolean);
  const enderecoCompleto = enderecoParts.length > 0 ? enderecoParts.join(', ') : 'Não informado';

  // Início da Atividade Profissional
  const inicioProfissional = formatData(
    clientData.dataAtividade || clientData.inicioProfissional || clientData.inicioAtividade
  ) || 'Não informado';

  // OAB / Registro Profissional
  const oab = String(clientData.oab || clientData.registroProfissionalNumero || 'Não informado');

  // Cobertura LMI
  let coberturaStr = String(
    clientData.valorCobertura || clientData.cobertura || clientData.lmi || cotacao.importancia_segurada || '100.000,00'
  ).trim();
  if (/^\d+(\.\d+)?$/.test(coberturaStr)) {
    coberturaStr = formatMoeda(Number(coberturaStr));
  } else if (!coberturaStr.startsWith('R$')) {
    coberturaStr = `R$ ${coberturaStr}`;
  }

  // Franquia
  let franquiaStr = String(clientData.planoFranquia || clientData.franquia || '1.000,00').trim();
  if (/^\d+(\.\d+)?$/.test(franquiaStr)) {
    franquiaStr = formatMoeda(Number(franquiaStr));
  } else if (!franquiaStr.startsWith('R$')) {
    franquiaStr = `R$ ${franquiaStr}`;
  }

  // Forma de pagamento
  const parcelasQtd = qtdParcelas > 0 ? qtdParcelas : (Number(clientData.parcela) || 1);
  const parcelaValor = valorParcela > 0 ? valorParcela : (valorTotal / parcelasQtd);
  const formaPagamentoTexto = parcelasQtd > 1
    ? `${parcelasQtd} parcelas de ${formatMoeda(parcelaValor)}`
    : `1 parcela de ${formatMoeda(valorTotal)} à vista`;

  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesAtual = MESES[hoje.getMonth()];
  const anoHoje = hoje.getFullYear();
  const cidadeCorretora = corretora.cidade || 'Florianópolis';

  const logoDataUri = corretora.logoBuffer
    ? `data:${corretora.logoMimeType || 'image/png'};base64,${corretora.logoBuffer.toString('base64')}`
    : undefined;

  const contractData: ContractData = {
    proponente: {
      nome: cotacao.client_name,
      dataNascimento: formatData(clientData.dataNascto || clientData.nascimento) || 'Não informado',
      cpf: formatCpf(cotacao.client_cpf_cnpj || clientData.cpf),
      email: cotacao.client_email || clientData.email || 'Não informado',
      celular: cotacao.client_phone || clientData.celular || clientData.telefone || 'Não informado',
      endereco: enderecoCompleto,
      inicioProfissional,
      oab,
    },
    condicoes: {
      importanciaSegurada: coberturaStr,
      franquia: franquiaStr,
      valorPremio: formatMoeda(valorTotal),
      formaPagamento: formaPagamentoTexto,
      vigencia: '1 ano',
      estipulante: 'DUOLIFE PLATAFORMA DE NEGÓCIOS',
      corretora: corretora.nomeFantasia || corretora.razaoSocial,
      seguradora: 'AKAD SEGUROS S.A.',
    },
    corretora: {
      nome: corretora.nomeFantasia || corretora.razaoSocial,
      razaoSocial: corretora.razaoSocial,
      nomeFantasia: corretora.nomeFantasia,
      cnpj: corretora.cnpj,
      cidade: corretora.cidade || 'Florianópolis',
      estado: corretora.uf || 'SC',
      logoUrl: logoDataUri,
      email: corretora.email,
      phone: corretora.phone,
      website: corretora.website,
      footerText: corretora.footerText,
      primaryColor: corretora.primaryColor,
    },
    dataCidade: {
      cidade: cidadeCorretora,
      dia: diaHoje,
      mes: mesAtual,
      ano: anoHoje,
    },
  };

  const cleanClientName = (cotacao.client_name || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_');
  const idCurto = cotacao.id.slice(0, 8).toUpperCase();
  const tipoDocSufixo = tipoContrato === 'termo_saude'
    ? 'Saude_TermoAdesao'
    : tipoContrato === '100k'
      ? '100k'
      : tipoContrato === '100k_renovacao'
        ? '100k_Renovacao'
        : 'Oficial';

  const docName = `Proposta_RC_${tipoDocSufixo}_${corretora.nomeFantasia.replace(/[^a-zA-Z0-9]/g, '')}_${cleanClientName}_${idCurto}.pdf`;

  return {
    cotacao,
    clientData,
    corretora,
    contractData,
    tipoContrato,
    valorTotal,
    qtdParcelas,
    valorParcela,
    docName,
  };
}

/**
 * Renderiza o HTML completo timbrado A4 do contrato para uma cotação.
 */
export async function renderContractHtmlForQuote(cotacaoId: string): Promise<{
  html: string;
  docName: string;
  contractData: ContractData;
  corretora: CorretoraContratoInfo;
}> {
  const { cotacao, contractData, corretora, docName } = await buildContractDataForQuote(cotacaoId);

  const innerHtml = renderRcAdvogadoInnerHtml(contractData);
  const sheetHtml = renderA4SheetHtml({
    innerHtml,
    corretoraNome: contractData.corretora?.nomeFantasia || contractData.corretora?.nome,
    corretoraLogoUrl: contractData.corretora?.logoUrl,
    corretoraEndereco: corretora.enderecoFormatado,
    corretoraContato: [corretora.phone, corretora.email].filter(Boolean).join(' • '),
    corretoraWebsite: corretora.website,
    corretoraCnpj: corretora.cnpj,
    footerText: corretora.footerText,
    primaryColor: corretora.primaryColor,
  });

  let fullHtml = buildHtmlDocument(sheetHtml, {
    title: `Termo de Adesão - ${cotacao.client_name}`,
  });

  fullHtml = await inlineLocalAssets(fullHtml);

  return {
    html: fullHtml,
    docName,
    contractData,
    corretora,
  };
}

/**
 * Gera o PDF do contrato utilizando o motor Gotenberg de alta fidelidade (Chromium),
 * com circuit-breaker / fallback automático transparente para PDF-Lib caso o container
 * Gotenberg esteja indisponível.
 */
export async function gerarContratoPdfGotenberg(
  cotacaoId: string,
  options: GerarContratoGotenbergOptions = {}
): Promise<GotenbergContractResult> {
  const { forceFallback = false, waitDelayMs = 250 } = options;

  try {
    const {
      cotacao,
      corretora,
      tipoContrato,
      docName,
    } = await buildContractDataForQuote(cotacaoId);

    // Contratos de saúde (médicos/dentistas) continuam usando o gerador dedicado de saúde do pdf-lib
    if (tipoContrato === 'termo_saude' || forceFallback) {
      const fallbackResult = await gerarContratoPdfBuffer(cotacaoId);
      return {
        ...fallbackResult,
        engine: 'pdflib_fallback',
      };
    }

    // Checa se o Gotenberg está online e acessível
    const gotenbergOnline = await isGotenbergAvailable(1500);
    if (!gotenbergOnline) {
      logger.warn(
        { cotacaoId },
        'gotenberg.gerar_contrato.offline_fallback_to_pdflib'
      );
      const fallbackResult = await gerarContratoPdfBuffer(cotacaoId);
      return {
        ...fallbackResult,
        engine: 'pdflib_fallback',
      };
    }

    // Renderiza HTML estático e embuti assets
    const { html } = await renderContractHtmlForQuote(cotacaoId);

    // Converte HTML para PDF com calibração A4 de 300 DPI no Chromium do Gotenberg
    const pdfResult = await convertHtmlToPdf({
      html,
      waitDelayMs,
      emulateMediaType: 'print',
    });

    logger.info(
      {
        cotacaoId,
        sizeBytes: pdfResult.size,
        docName,
      },
      'gotenberg.gerar_contrato.success'
    );

    return {
      buffer: pdfResult.buffer,
      base64: pdfResult.base64,
      docName,
      tipoContrato,
      signatario: {
        nome: cotacao.client_name,
        email: cotacao.client_email || 'suporte@duolife.net.br',
        phone: cotacao.client_phone || '',
        cpfCnpj: cotacao.client_cpf_cnpj,
      },
      signatarioCorretora: {
        nome: corretora.nomeFantasia || corretora.razaoSocial,
        email: corretora.email || 'contato@net4life.com.br',
        phone: corretora.phone,
      },
      signatarioProponente: {
        nome: cotacao.client_name,
        email: cotacao.client_email || 'suporte@duolife.net.br',
        phone: cotacao.client_phone || '',
        cpfCnpj: cotacao.client_cpf_cnpj,
      },
      engine: 'gotenberg',
    };
  } catch (err: any) {
    logger.error(
      { cotacaoId, error: err?.message },
      'gotenberg.gerar_contrato.error_triggering_pdflib_fallback'
    );

    // Fallback de segurança garantido: nunca deixa a operação cair em erro 500
    const fallbackResult = await gerarContratoPdfBuffer(cotacaoId);
    return {
      ...fallbackResult,
      engine: 'pdflib_fallback',
    };
  }
}
