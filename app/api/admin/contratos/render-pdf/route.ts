import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { logger } from '@/lib/logger';
import {
  convertHtmlToPdf,
  isGotenbergAvailable,
  getGotenbergUrl,
  substituirTagsHtml,
  inlineLocalAssets,
  buildHtmlDocument,
  GotenbergUnavailableError,
} from '@/lib/gotenberg-client';
import {
  getContractTemplateBySlug,
  type ContractTemplate,
} from '@/lib/contract-templates-service';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Autentica a requisição:
 * 1. Sessão de usuário interno (DuoLife Admin/Dev)
 * 2. Token de autorização interno via header Bearer ou x-internal-secret
 * 3. Em ambiente local de desenvolvimento, permite testes diretos com header 'x-dev-test'
 */
async function authorizeRequest(req: NextRequest): Promise<{ authorized: boolean; reason?: string }> {
  try {
    const user = await verifyAuth();
    if (user && roleIsInternal(user.role)) {
      return { authorized: true };
    }
  } catch {
    // Continua para checagens de token de serviço
  }

  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = process.env.INTERNAL_SERVICE_KEY || process.env.CRON_SECRET || process.env.JWT_SECRET;

  if (expectedSecret && (bearerToken === expectedSecret || internalSecret === expectedSecret)) {
    return { authorized: true };
  }

  if (process.env.NODE_ENV !== 'production') {
    if (req.headers.get('x-dev-test') === 'true') {
      return { authorized: true };
    }
  }

  return { authorized: false, reason: 'Acesso restrito a administradores internos da DuoLife.' };
}

/**
 * Renderiza o contêiner de folha A4 timbrada oficial da Kev / DuoLife em HTML puro
 */
function renderA4SheetHtml(params: {
  innerHtml: string;
  corretoraNome?: string;
  corretoraLogoUrl?: string;
  backgroundUrl?: string;
}): string {
  const bg = params.backgroundUrl || '/images/contrato-kev/kev-background.jpg';
  const cNome = params.corretoraNome || 'Corretora Parceira';
  const cLogo = params.corretoraLogoUrl
    ? `<img src="${params.corretoraLogoUrl}" alt="${cNome}" class="max-h-[36px] max-w-[150px] object-contain" />`
    : `<div class="flex flex-col">
        <span class="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-tight line-clamp-2">${cNome}</span>
        <span class="text-[7.5px] font-semibold text-emerald-800 tracking-wider uppercase">Corretora de Seguros</span>
       </div>`;

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

        <!-- RODAPÉ INSTITUCIONAL KEV SEGUROS -->
        <footer class="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-center select-none">
          <div class="w-4 h-4 flex items-center justify-center shrink-0">
            <img src="/images/contrato-kev/chevron-left.jpg" alt="" class="h-2.5 w-auto object-contain" />
          </div>
          <div class="flex-1 px-4">
            <p class="text-[6.8px] text-slate-600 font-medium tracking-tight leading-tight">
              Avenida Brigadeiro Faria Lima, 3477, Torre B, 2º andar. Itaim Bibi, São Paulo - SP, 04538-133
            </p>
            <p class="text-[6.8px] font-bold text-slate-800 tracking-tight leading-tight mt-0.5">
              kevseguros.com.br
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
 * Renderiza o corpo do contrato de RC Advogados com fidelidade total à diagramação oficial
 */
function renderRcAdvogadoInnerHtml(dados: Record<string, any>, template?: ContractTemplate | null): string {
  const pNome = dados.nome || dados.proponente?.nome || 'Dr(a). Não informado';
  const pNasc = dados.dataNascimento || dados.dataNascto || dados.proponente?.dataNascimento || 'Não informado';
  const pCpf = dados.cpf || dados.proponente?.cpf || 'Não informado';
  const pEmail = dados.email || dados.proponente?.email || 'Não informado';
  const pCelular = dados.celular || dados.proponente?.celular || 'Não informado';
  const pEndereco = dados.endereco || dados.proponente?.endereco || 'Não informado';
  const pInicio = dados.inicioProfissional || dados.proponente?.inicioProfissional || 'Não informado';
  const pOab = dados.oab || dados.registroProfissional || dados.proponente?.oab || 'Não informado';

  const cImportancia = dados.importanciaSegurada || dados.condicoes?.importanciaSegurada || 'R$ 100.000,00';
  const cFranquia = dados.franquia || dados.condicoes?.franquia || 'Não há aplicação de franquia';
  const cPremio = dados.valorPremio || dados.condicoes?.valorPremio || 'R$ 790,00';
  const cFormaPag = dados.formaPagamento || dados.condicoes?.formaPagamento || '1x à vista';
  const cVigencia = dados.vigencia || dados.condicoes?.vigencia || '1 ano';
  const cEstipulante = dados.estipulante || template?.configuracoes?.estipulante || 'DUOLIFE PLATAFORMA DE NEGÓCIOS';
  const cCorretora = dados.corretora || dados.corretoraObj?.nome || 'DuoLife Corretora de Seguros';
  const cSeguradora = dados.seguradora || template?.configuracoes?.seguradora || 'AKAD SEGUROS S.A.';

  const titulo = template?.titulo || 'Seguro de Responsabilidade Civil para Advogado';
  const subtitulo = template?.subtitulo || 'Termo de Adesão por parte do Advogado';
  const declaracaoTexto = template?.declaracao_texto ||
    'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.';

  const dataHoje = new Date();
  const cidade = dados.cidade || dados.cidadeCorretora || 'São Paulo';
  const dia = dados.dia || dataHoje.getDate();
  const mes = dados.mes || MESES[dataHoje.getMonth()];
  const ano = dados.ano || dataHoje.getFullYear();

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
 * GET: Healthcheck do motor de PDF e status de conexão com o Gotenberg
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const available = await isGotenbergAvailable(3000);
  const url = getGotenbergUrl();

  return NextResponse.json({
    status: 'ok',
    engine: 'Gotenberg 8 (Chromium HTML-to-PDF)',
    gotenbergUrl: url,
    gotenbergAvailable: available,
    help: available
      ? 'Serviço Gotenberg conectado e operacional.'
      : 'Gotenberg inacessível. Execute: docker run --rm -p 3001:3000 gotenberg/gotenberg:8',
  });
}

/**
 * POST: Renderiza um contrato em PDF via Gotenberg
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      templateSlug,
      dados = {},
      htmlDireto,
      format: requestedFormat,
      download = false,
      filename: customFilename,
      waitDelayMs = 250,
      emulateMediaType = 'print',
    } = body;

    if (!htmlDireto && !templateSlug) {
      return NextResponse.json(
        { error: 'É necessário fornecer "templateSlug" ou "htmlDireto" no corpo da requisição.' },
        { status: 400 }
      );
    }

    let rawHtml = '';
    let docTitle = 'Contrato DuoLife';

    if (htmlDireto && typeof htmlDireto === 'string') {
      rawHtml = substituirTagsHtml(htmlDireto, dados);
      if (!rawHtml.includes('<!DOCTYPE') && !rawHtml.includes('<html')) {
        rawHtml = buildHtmlDocument(rawHtml, { title: docTitle });
      }
    } else if (templateSlug) {
      const template = await getContractTemplateBySlug(templateSlug);
      if (!template) {
        return NextResponse.json(
          { error: `Template com slug "${templateSlug}" não foi encontrado.` },
          { status: 404 }
        );
      }

      docTitle = template.titulo || 'Termo de Adesão';

      const innerContent = renderRcAdvogadoInnerHtml(dados, template);
      const sheetHtml = renderA4SheetHtml({
        innerHtml: innerContent,
        corretoraNome: dados.corretora || dados.corretoraObj?.nome,
        corretoraLogoUrl: dados.logoCorretora || dados.corretoraObj?.logoUrl,
      });

      rawHtml = buildHtmlDocument(sheetHtml, { title: docTitle });
      rawHtml = substituirTagsHtml(rawHtml, dados);
    }

    const finalHtml = await inlineLocalAssets(rawHtml);

    const pdfResult = await convertHtmlToPdf({
      html: finalHtml,
      waitDelayMs,
      emulateMediaType,
    });

    const slugName = templateSlug ? String(templateSlug).replace(/[^a-zA-Z0-9_-]/g, '_') : 'contrato';
    const filename = customFilename || `${slugName}-${Date.now()}.pdf`;

    const acceptHeader = req.headers.get('accept') || '';
    const shouldReturnJson =
      requestedFormat === 'json' ||
      (acceptHeader.includes('application/json') && requestedFormat !== 'pdf');

    if (shouldReturnJson) {
      return NextResponse.json({
        success: true,
        filename,
        size: pdfResult.size,
        base64: pdfResult.base64,
      });
    }

    const disposition = download ? 'attachment' : 'inline';
    return new Response(new Uint8Array(pdfResult.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Content-Length': String(pdfResult.size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    if (err instanceof GotenbergUnavailableError) {
      logger.error({ err }, 'api.admin.render_pdf.gotenberg_unavailable');
      return NextResponse.json(
        {
          error: 'Gotenberg não disponível',
          message: err.message,
          suggestion: 'Inicie o container: docker run --rm -p 3001:3000 gotenberg/gotenberg:8',
        },
        { status: 503 }
      );
    }

    logger.error({ err }, 'api.admin.render_pdf.error');
    return NextResponse.json(
      { error: 'Falha interna ao gerar PDF', details: err.message },
      { status: 500 }
    );
  }
}
