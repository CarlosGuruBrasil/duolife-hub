import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';
import { parseJsonbField } from '@/lib/json-safe';
import { calcularPrecoServidor } from '@/lib/pricing';
import { ESTADOS_TERMINAIS } from '@/lib/cotacao-status';
import { getZapSignConfig, sanitizeApiToken } from '@/lib/system-settings';
import { parseAtuacaoList } from '@/lib/atuacao';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { determinarTipoContrato } from '@/lib/pdf-contract-generator';
import { gerarContratoPdfGotenberg } from '@/lib/gotenberg-contract-generator';
import { getCorretoraParaContrato, isNet4LifeCorretora } from '@/lib/corretora-resolver';
import { GRUPOS_TARIFARIOS_SAUDE } from '@/lib/product-schemas';
import { criarDocumentoZapSignDireto, cancelarDocumentoZapSign } from '@/lib/zapsign-direct-docs';
import { dispatchDomainEvent } from '@/lib/triggers/dispatcher';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const publicToken = req.headers.get('x-public-token');
  let targetPartnerId: string | null = null;
  let user = null;

  if (publicToken) {
    const [link] = await sql`
      SELECT partner_id
      FROM public_sale_links
      WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `;
    if (!link) return Response.json({ error: 'Token público inválido ou expirado' }, { status: 401 });
    targetPartnerId = link.partner_id;
  } else {
    user = await verifyAuth();
    if (!user) return unauthorized();
    targetPartnerId = user.partnerId;
  }

  let requestBody: Record<string, any> = {};
  try {
    requestBody = await req.json();
  } catch {
    requestBody = {};
  }
  const forceRecreate = Boolean(requestBody?.forceRecreate || req.nextUrl.searchParams.get('force') === 'true');

  const actorKey = user ? user.userId : `${clientIp}:${targetPartnerId || 'anon'}`;
  const rl = rateLimit(`gerar-contrato:${actorKey}`, 10, 60 * 1000); // 10 gerações por minuto
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { id } = await params;

  try {
    // 1. Busca a cotação
    const cotacao = publicToken
      ? (await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    if (cotacao.status === 'pendente_duplicidade') {
      return Response.json(
        { error: 'Esta proposta possui duplicidade cadastral pendente de validação obrigatória pelo vendedor antes de gerar o contrato.' },
        { status: 422 }
      );
    }

    if (ESTADOS_TERMINAIS.includes(cotacao.status)) {
      return Response.json({ error: `Cotação já está em estado final (${cotacao.status}) — não é possível gerar contrato` }, { status: 422 });
    }

    const clientData = parseJsonbField<Record<string, any>>(cotacao.client_data);

    const flowKey = clientData.flowKey || cotacao.flow_key || null;
    const productId = clientData.productId || cotacao.product_id || null;
    const isMedico =
      flowKey === 'rc_medicos_v1' ||
      flowKey === 'rc-medicos' ||
      cotacao.flow_key === 'rc_medicos_v1' ||
      cotacao.flow_key === 'rc-medicos' ||
      productId === 'prod-rc-med-001';

    // Preço recalculado no servidor a partir da tabela real de planos/cupom — nunca aceito de
    // clientData.valor/valorParcela, que vêm do cliente e são forjáveis.
    const preco = await calcularPrecoServidor({
      tipoDePlano: clientData.tipo || clientData.tipoDePlano || null,
      qtdParcelasSolicitada: Number(clientData.parcela) || 1,
      cupomCodigo: clientData.cupomCodigo || null,
      descontoManualPercent: Number(clientData.descontoManualPercent ?? clientData.descontoPercentual) || 0,
      flowKey,
      productId,
      grupoTarifario: (clientData.grupoTarifario as string) || (clientData.grupo as string) || null,
    });

    const valorTotal = preco?.valorTotal ?? Number(cotacao.premio_final || cotacao.premio_calculado || 0);
    const qtdParcelasContrato = preco?.qtdParcelas ?? 1;
    const valorParcelaContrato = preco?.valorParcela ?? valorTotal;
    // Quando parcelado, o total efetivamente cobrado (com juros já embutidos na parcela) pode ser
    // maior que o valor à vista — não usar valorTotal sozinho como "o que o cliente paga".
    const valorTotalComJuros = qtdParcelasContrato > 1 ? valorParcelaContrato * qtdParcelasContrato : valorTotal;

    if (!valorTotal || valorTotal <= 0) {
      logger.error({ cotacaoId: cotacao.id }, 'api.portal.gerar-contrato.valor_invalido');
      return Response.json({ error: 'Cotação sem valor de prêmio calculado — não é possível gerar contrato' }, { status: 422 });
    }

    // Prazo de validade universal: exatamente 7 dias corridos a partir da geração
    const PRAZO_DIAS_ASSINATURA = 7;
    const deadlineDate = new Date(Date.now() + PRAZO_DIAS_ASSINATURA * 24 * 60 * 60 * 1000);
    const deadlineIso = deadlineDate.toISOString();
    const deadlineZapSign = deadlineIso.slice(0, 10); // YYYY-MM-DD aceito pelo ZapSign

    const contratoGeradoEm = clientData.contratoGeradoEm ? new Date(clientData.contratoGeradoEm) : null;
    const signUrlExpirado = contratoGeradoEm
      ? (Date.now() - contratoGeradoEm.getTime()) > PRAZO_DIAS_ASSINATURA * 24 * 60 * 60 * 1000
      : false;

    // 2. Determina corretora vinculada e modo do ZapSign
    const corretoraInfo = await getCorretoraParaContrato(cotacao.id);
    const isNet4Life = isNet4LifeCorretora(corretoraInfo);
    const zapConfig = await getZapSignConfig();

    // Regra de Negócio:
    // Apenas propostas vinculadas à corretora Net4life podem utilizar o modo por 'template' da ZapSign (quando habilitado).
    // Para todas as demais corretoras parceiras, força OBRIGATORIAMENTE 'dynamic_pdf' (layout timbrado com logo e dados da corretora).
    const isDynamicPdf =
      !isNet4Life ||
      isMedico ||
      zapConfig.docGenerationMode === 'dynamic_pdf' ||
      req.nextUrl.searchParams.get('modo') === 'dynamic_pdf';

    const tipoContrato = determinarTipoContrato(clientData, cotacao);
    const templateId = tipoContrato === '100k_renovacao'
      ? zapConfig.templateRenovacao
      : tipoContrato === '100k'
        ? zapConfig.template100k
        : zapConfig.templateOficial;

    logger.info(
      {
        cotacaoId: cotacao.id,
        isNet4Life,
        corretoraId: corretoraInfo.id,
        corretoraNome: corretoraInfo.nomeFantasia,
        isDynamicPdf,
        docGenerationMode: zapConfig.docGenerationMode,
        tipoContrato,
        templateId,
        isRenovacao: Boolean(cotacao.is_renewal || clientData.isRenovacao === 'Sim' || clientData.renovacao === true),
        tipoPlano: clientData.tipo || clientData.tipoDePlano,
        cobertura: clientData.cobertura || clientData.valorCobertura || cotacao.importancia_segurada,
      },
      'api.portal.gerar-contrato.template_resolvido'
    );

    if (!isDynamicPdf && !templateId) {
      return Response.json({ error: 'Template do ZapSign não configurado' }, { status: 422 });
    }

    const desiredContratoModo = isDynamicPdf ? 'dynamic_pdf' : 'template';
    const isMinutaOutdated = Boolean(clientData.minutaDesatualizada);
    const isTemplateMismatch = !isDynamicPdf && Boolean(clientData.contratoTemplateId) && clientData.contratoTemplateId !== templateId;
    const isTipoMismatch = Boolean(clientData.contratoTipo) && clientData.contratoTipo !== tipoContrato;
    const isModoMismatch = Boolean(clientData.contratoModo) && clientData.contratoModo !== desiredContratoModo;

    const needsRecreation =
      forceRecreate ||
      signUrlExpirado ||
      isMinutaOutdated ||
      isTemplateMismatch ||
      isTipoMismatch ||
      isModoMismatch;

    // Se NÃO for solicitação explícita de regeração nem houver divergência de modelo/dados, e o contrato anterior existir e não estiver expirado:
    if (!needsRecreation && clientData.contratoToken) {
      const isDynamic = clientData.contratoModo === 'dynamic_pdf' || isMedico;
      const totalAssinaturas = Number(clientData.totalAssinaturas) || (isDynamic ? 2 : 1);
      const assinaturasNecessarias = clientData.assinaturasNecessarias || (totalAssinaturas === 1 ? ['cliente'] : ['cliente', 'corretora']);
      const statusPadrao = totalAssinaturas === 1 ? 'falta_cliente' : 'faltam_ambas';

      return Response.json({
        ok: true,
        docToken: clientData.contratoToken,
        signUrl: clientData.signUrl,
        signUrlCorretora: isDynamic ? (clientData.signUrlCorretora || null) : null,
        signUrlProponente: clientData.signUrlProponente || clientData.signUrl || null,
        statusAssinatura: clientData.statusAssinatura || statusPadrao,
        totalAssinaturas,
        assinaturasNecessarias,
        contratoModo: clientData.contratoModo || (isDynamic ? 'dynamic_pdf' : 'template'),
        clienteAssinou: Boolean(clientData.clienteAssinou),
        corretoraAssinou: totalAssinaturas === 1 ? true : Boolean(clientData.corretoraAssinou),
        alreadyExisted: true,
      });
    }

    // Se for regeração (forceRecreate, expiração ou divergência de modelo), e houver um token anterior na ZapSign:
    // 1. Cancela o documento anterior na ZapSign para invalidar o link antigo imediatamente
    // 2. Marca o documento anterior em signature_documents como 'cancelled' ou 'expired'
    if (clientData.contratoToken) {
      try {
        await cancelarDocumentoZapSign(clientData.contratoToken);
      } catch (cancelErr) {
        logger.warn({ cancelErr, docToken: clientData.contratoToken }, 'api.portal.gerar-contrato.cancel_old_warn');
      }

      await sql`
        UPDATE signature_documents
        SET status = ${signUrlExpirado ? 'expired' : 'cancelled'}, updated_at = NOW()
        WHERE cotacao_id = ${cotacao.id} AND status NOT IN ('cancelled', 'refused', 'expired')
      `;
    }

    // 2b. Consome o uso do cupom promocional (se houver) de forma atômica e idempotente por cotação.
    // O Wix só guarda um contador estático (quantidadeUsada) que nunca é escrito de volta — aqui o
    // DuoLife mantém o controle real. Se o limite já foi atingido, não bloqueamos a venda (o cliente já
    // viu o preço com desconto e fechou negócio), só registramos o excesso para auditoria.
    const cupomCodigo = clientData.cupomCodigo ? String(clientData.cupomCodigo).trim() : null;
    if (cupomCodigo) {
      try {
        const [evento] = await sql`
          INSERT INTO cupom_uso_eventos (cupom_codigo, cotacao_id)
          VALUES (${cupomCodigo}, ${cotacao.id})
          ON CONFLICT (cotacao_id) DO NOTHING
          RETURNING id
        `;

        if (evento) {
          const cupomItens = await sql`
            SELECT wi.payload FROM wix_items wi
            JOIN wix_collections wc ON wi.wix_collection_id = wc.id
            WHERE (wc.collection_name ILIKE '%CUPOM%' OR wc.collection_id ILIKE '%CUPOM%')
              AND wi.is_active = true
            ORDER BY wi.created_at DESC
          `;
          const cupomData = cupomItens
            .map(r => {
              try {
                const parsed = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
                const itemObj = (parsed?.item || parsed) as Record<string, unknown>;
                return (itemObj?.data || itemObj) as Record<string, unknown>;
              } catch {
                return null;
              }
            })
            .find(c => {
              const cod = String(c?.codigo || c?.nome || c?.Codigo || '').trim().toLowerCase();
              return cod === cupomCodigo.toLowerCase();
            });

          const limite = Number(cupomData?.quantidade) || null;

          const [resultado] = await sql`
            INSERT INTO cupom_usos (cupom_codigo, usos, limite)
            VALUES (${cupomCodigo}, 1, ${limite})
            ON CONFLICT (cupom_codigo) DO UPDATE
            SET usos = cupom_usos.usos + 1, limite = COALESCE(EXCLUDED.limite, cupom_usos.limite), updated_at = NOW()
            WHERE cupom_usos.usos < COALESCE(cupom_usos.limite, 2147483647)
            RETURNING usos
          `;

          if (!resultado) {
            logger.warn({ cupomCodigo, cotacaoId: cotacao.id }, 'api.portal.gerar-contrato.cupom_limite_excedido');
          }
        }
      } catch (err) {
        logger.error({ err, cupomCodigo, cotacaoId: cotacao.id }, 'api.portal.gerar-contrato.cupom_consumo_failed');
      }
    }

    // 3. Busca a descrição de cargos PPE se aplicável
    let ppeDescricao = '';
    const arrayCargoSelect = clientData.ppeCargoSelect
      ? String(clientData.ppeCargoSelect).split(',').map(x => x.trim()).filter(Boolean)
      : [];

    if (arrayCargoSelect.length > 0) {
      try {
        const rows = await sql`
          SELECT payload FROM wix_items
          WHERE wix_collection_id IN (
            SELECT id FROM wix_collections WHERE collection_id = 'PPECARGOS'
          )
          AND is_active = true
        `;
        const cargos = rows
          .map(r => {
            try {
              const parsed = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
              return parsed?.item?.data || null;
            } catch {
              return null;
            }
          })
          .filter(c => c && arrayCargoSelect.includes(String(c.id_)));

        ppeDescricao = cargos.map(c => c.text).join('\n');
      } catch (err) {
        logger.error({ err }, 'api.portal.gerar-contrato.fetch_ppe_failed');
      }
    }

    // 4. Formata áreas de atuação
    const areaAtuacao = parseAtuacaoList(clientData.atuacao);
    const checkArea = (name: string) => areaAtuacao.includes(name) ? 'X' : ' ';

    // Formatadores locais de data e moeda
    const formatMoeda = (val: any) => {
      const num = Number(val) || 0;
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatData = (val: any) => {
      if (!val) return '';
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    };

    const hoje = new Date();
    const dia = String(hoje.getDate());
    const mes = hoje.toLocaleString('pt-BR', { month: 'long' });
    const ano = String(hoje.getFullYear());

    const questionarioRisco = (clientData.questionarioRisco && typeof clientData.questionarioRisco === 'object'
      ? clientData.questionarioRisco
      : {}) as Record<string, any>;

    const resolveSimNao = (...candidates: any[]): 'Sim' | 'Não' => {
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
    };

    const resolveDetalhe = (resposta: 'Sim' | 'Não', ...candidates: any[]): string => {
      if (resposta !== 'Sim') return ' ';
      for (const raw of candidates) {
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          return String(raw).trim();
        }
      }
      return ' ';
    };

    const propostaRecusada = resolveSimNao(clientData.propostaRecusada, questionarioRisco.propostaRecusada);
    const reclamacaoProfissional = resolveSimNao(clientData.reclamacaoProfissional, questionarioRisco.reclamacaoProfissional);
    const investigacaoAutoridade = resolveSimNao(clientData.investigacaoAutoridade, questionarioRisco.investigacaoAutoridade);
    const fatoTerceiros = resolveSimNao(clientData.fatoTerceiros, questionarioRisco.fatoTerceiros);
    const pagouReclamacao = resolveSimNao(clientData.pagouReclamacao, questionarioRisco.pagouReclamacao);

    const formatCpf = (raw?: string | null): string => {
      if (!raw) return '';
      const digits = String(raw).replace(/\D/g, '');
      if (digits.length === 11) {
        return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
      }
      if (digits.length === 14) {
        return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      }
      return raw;
    };

    // Especialidade Saúde
    const grupoCodigoSaude = String(clientData.grupoTarifario || clientData.grupo || '').toUpperCase();
    const grupoDefSaude = GRUPOS_TARIFARIOS_SAUDE.find((g) => g.id === grupoCodigoSaude || g.codigo === grupoCodigoSaude.toLowerCase());
    const espSaudeSel = clientData.especialidadeMedica || clientData.especialidade || '';
    const especialidadeSaudeTexto = grupoDefSaude
      ? `${grupoDefSaude.label}${espSaudeSel ? ` — ${espSaudeSel}` : ''}`
      : espSaudeSel || 'Profissional da Saúde / Especialidades Clínicas e Cirúrgicas';

    const houveReclamacaoSaude = resolveSimNao(
      clientData.houveReclamacao,
      clientData.reclamacaoErroMedico,
      clientData.reclamacaoProfissional,
      questionarioRisco.reclamacaoErroMedico,
      questionarioRisco.reclamacaoProfissional
    );

    const conhecimentoFatoSaude = resolveSimNao(
      clientData.conhecimentoFato,
      clientData.fatoPotencial,
      clientData.fatoTerceiros,
      questionarioRisco.fatoPotencial,
      questionarioRisco.fatoTerceiros
    );

    // 5. Monta o dicionário de variáveis para o template do ZapSign
    // Mapeia tanto as tags novas dos contratos atualizados (100k, 300k+ e Renovação)
    // quanto as tags legadas para retrocompatibilidade total.
    const enderecoFormatadoProponente = clientData.endereco || [
      clientData.logradouro,
      clientData.numero ? `nº ${clientData.numero}` : null,
      clientData.complemento ? `(${clientData.complemento})` : null,
      clientData.bairro,
      clientData.cidade && clientData.uf ? `${clientData.cidade}/${clientData.uf}` : (clientData.cidade || clientData.uf),
      clientData.cep ? `CEP: ${clientData.cep}` : null,
    ].filter(Boolean).join(', ') || 'Não informado';

    const valorFranquiaPlano = clientData.planoFranquia || clientData.franquia || 'R$ 1.000,00';

    const variaveis: Record<string, string> = {
      // Dados Pessoais / Proponente (Novas tags + Legadas)
      "nome": cotacao.client_name,
      "nome_cliente": cotacao.client_name,
      "email": cotacao.client_email || '',
      "celular": cotacao.client_phone || '',
      "cpf": cotacao.client_cpf_cnpj,
      "oab": clientData.oab || clientData.registroProfissionalNumero || '',
      "dataNascto": formatData(clientData.dataNascto || clientData.nascimento),
      "nascimento": formatData(clientData.dataNascto || clientData.nascimento),

      // Endereço (Tag unificada e tags decompostas)
      "endereco": enderecoFormatadoProponente,
      "endereco_completo": enderecoFormatadoProponente,
      "logradouro": clientData.logradouro || '',
      "numero": String(clientData.numero || ''),
      "complemento": clientData.complemento || '',
      "cep": clientData.cep || '',
      "bairro": clientData.bairro || '',
      "cidade": clientData.cidade || '',
      "uf": clientData.uf || '',
      "lgpd": "X",

      // Dados Profissionais (Novas tags + Legadas)
      "inicioProfissional": formatData(clientData.dataAtividade || clientData.inicioProfissional),
      "inicio_profissional": formatData(clientData.dataAtividade || clientData.inicioProfissional),
      "escritorio": clientData.associadoEscritorio === 'Sim'
        ? (clientData.nomeEscritorio || clientData.escritorioAssociado || clientData.escritorio || '')
        : (clientData.escritorioAssociado && clientData.escritorioAssociado !== 'Não associado' && clientData.escritorioAssociado !== 'Não'
            ? clientData.escritorioAssociado
            : 'Não associado'),
      "escritorio_associado": clientData.associadoEscritorio === 'Sim'
        ? (clientData.nomeEscritorio || clientData.escritorioAssociado || clientData.escritorio || '')
        : (clientData.escritorioAssociado && clientData.escritorioAssociado !== 'Não associado' && clientData.escritorioAssociado !== 'Não'
            ? clientData.escritorioAssociado
            : 'Não associado'),
      "titularidade": clientData.titularidade || '',
      "faturamentoAntes": clientData.faturamentoAntes || clientData.faturamento_ultimos || 'Não informado',
      "faturamentoDepois": clientData.faturamentoDepois || clientData.faturamento_proximos || 'Não informado',
      "faturamento_ultimos": clientData.faturamentoAntes || clientData.faturamento_ultimos || 'Não informado',
      "faturamento_proximos": clientData.faturamentoDepois || clientData.faturamento_proximos || 'Não informado',

      // Áreas de Atuação (Suporta chaves completas e encurtadas dos novos PDFs)
      "civil": checkArea("civil"),
      "propriedadeIndustrial": checkArea("propriedadeIndustrial"),
      "industrial": checkArea("propriedadeIndustrial"),
      "bancarioFinanceiro": checkArea("bancarioFinanceiro"),
      "financeiro": checkArea("bancarioFinanceiro"),
      "criminal": checkArea("criminal"),
      "tributaria": checkArea("tributaria"),
      "tributario": checkArea("tributaria"),
      "previdenciario": checkArea("previdenciario"),
      "direitoInternacional": checkArea("direitoInternacional"),
      "internacional": checkArea("direitoInternacional"),
      "fusoesAquisicoes": checkArea("fusoesAquisicoes"),
      "fusoes": checkArea("fusoesAquisicoes"),
      "direitoEmpresarial": checkArea("direitoEmpresarial"),
      "empresarial": checkArea("direitoEmpresarial"),
      "trabalhista": checkArea("trabalhista"),
      "societario": checkArea("societario"),
      "outros": checkArea("outros"),

      // PPE - Pessoa Politicamente Exposta (Novas tags + Legadas)
      "ppeCargos": resolveSimNao(clientData.ppeCargos, clientData.ppe, clientData.tem_cargos),
      "tem_cargos": resolveSimNao(clientData.ppeCargos, clientData.ppe, clientData.tem_cargos),
      "ppeRepresenta": resolveSimNao(clientData.ppeRepresenta, clientData.ppeRelacionado, clientData.representante_legal),
      "representante_legal": resolveSimNao(clientData.ppeRepresenta, clientData.ppeRelacionado, clientData.representante_legal),
      "ppeCargoSelect": ppeDescricao || ' ',
      "cargos_ppe": ppeDescricao || ' ',

      // Informações do Seguro de Responsabilidade Civil Anterior
      "seguradora": clientData.seguradora || ' ',
      "limite": clientData.limite || clientData.lmiAnterior || ' ',
      "vigencia": clientData.vigencia ? formatData(clientData.vigencia) : ' ',
      "premio": clientData.premio || ' ',
      "dataRetroativa": clientData.dataRetroativa ? formatData(clientData.dataRetroativa) : 'Início de Vigência',
      "franquiaAnterior": clientData.franquiaAnterior || ' ',

      // Questionário de Risco / Histórico de Reclamação (Novas tags + Legadas)
      "propostaRecusada": propostaRecusada,
      "proposta_recusada": propostaRecusada,
      "propostaDetalhe": resolveDetalhe(propostaRecusada, clientData.propostaDetalhe, questionarioRisco.propostaDetalhe),
      "reclamacaoProfissional": reclamacaoProfissional,
      "reclamacoes": reclamacaoProfissional,
      "reclamacaoDetalhe": resolveDetalhe(reclamacaoProfissional, clientData.reclamacaoDetalhe, questionarioRisco.reclamacaoDetalhe),
      "investigacaoAutoridade": investigacaoAutoridade,
      "acao_disciplinar": investigacaoAutoridade,
      "investigacaoDetalhe": resolveDetalhe(investigacaoAutoridade, clientData.investigacaoDetalhe, questionarioRisco.investigacaoDetalhe),
      "fatoTerceiros": fatoTerceiros,
      "reclamacao_terceiros": fatoTerceiros,
      "fatoDetalhe": resolveDetalhe(fatoTerceiros, clientData.fatoDetalhe, questionarioRisco.fatoDetalhe),
      "pagouReclamacao": pagouReclamacao,
      "fundos_proprios": pagouReclamacao,
      "pagouDetalhe": resolveDetalhe(pagouReclamacao, clientData.pagouDetalhe, questionarioRisco.pagouDetalhe),

      // Termo de Adesão da Saúde (Tags Oficiais do Documento do Usuário)
      "website": clientData.website || clientData.site || 'Não informado',
      "cpf-cnpj": formatCpf(cotacao.client_cpf_cnpj),
      "data_atividades": formatData(clientData.dataAtividade),
      "registro_profissional": clientData.crm || clientData.cro || clientData.registroProfissionalNumero || clientData.oab || 'Não informado',

      // Processos Internos e Atendimento
      "assinam": clientData.assinamConsentimento === 'Não' ? ' ' : 'X',
      "nao_assinam": clientData.assinamConsentimento === 'Não' ? 'X' : ' ',
      "domicilio": clientData.prestacaoDomicilio === 'Sim' ? 'X' : ' ',
      "nao_domicilio": clientData.prestacaoDomicilio === 'Sim' ? ' ' : 'X',
      "proprio_risco": clientData.auditoriaRisco === 'Não' ? ' ' : 'X',
      "nao_proprio_risco": clientData.auditoriaRisco === 'Não' ? 'X' : ' ',
      "atendimentos_mensais": String(clientData.atendimentosMensais || clientData.volumeAtendimentos || '80 atendimentos/mês'),
      "arquivos_prontuarios": String(clientData.arquivamentoProntuarios || 'Digital / Prontuário Eletrônico em Nuvem'),

      // Especialidades
      "especialidade": especialidadeSaudeTexto,

      // Renovação do Seguro
      "renovacao": clientData.isRenovacao === 'Sim' ? 'X' : ' ',
      "nao_renovacao": clientData.isRenovacao === 'Sim' ? ' ' : 'X',

      // Histórico de Reclamações (Página 1 Saúde)
      "houve_reclamacao": houveReclamacaoSaude === 'Sim' ? 'X' : ' ',
      "nao_houve_reclamacao": houveReclamacaoSaude === 'Sim' ? ' ' : 'X',
      "data_ocorrencia": houveReclamacaoSaude === 'Sim' ? (clientData.dataOcorrenciaReclamacao || formatData(clientData.dataOcorrencia) || 'Não informada') : 'Não se aplica',
      "data_reclamacao": houveReclamacaoSaude === 'Sim' ? (clientData.dataReclamacao || 'Não informada') : 'Não se aplica',
      "detalhes_reclamacao": houveReclamacaoSaude === 'Sim' ? (clientData.detalhesReclamacao || clientData.reclamacaoErroMedicoDetalhe || clientData.reclamacaoDetalhe || 'Não informado') : 'Sem histórico de reclamações',
      "valor_indenizado": houveReclamacaoSaude === 'Sim' ? (clientData.valorIndenizado ? (String(clientData.valorIndenizado).startsWith('R$') ? clientData.valorIndenizado : formatMoeda(clientData.valorIndenizado)) : 'R$ 0,00') : 'R$ 0,00',
      "status_atual": houveReclamacaoSaude === 'Sim' ? (clientData.statusReclamacao || 'Regular') : 'Regular',

      // Histórico de Fatos Conhecidos (Página 2 Saúde)
      "conhecimento_fato": conhecimentoFatoSaude === 'Sim' ? 'X' : ' ',
      "sem_conhecimento_fato": conhecimentoFatoSaude === 'Sim' ? ' ' : 'X',
      "data_ocorrencia_conhecimento": conhecimentoFatoSaude === 'Sim' ? (clientData.dataOcorrenciaFato || 'Não informada') : 'Não se aplica',
      "data_reclamacao_conhecimento": conhecimentoFatoSaude === 'Sim' ? (clientData.dataReclamacaoFato || 'Não informada') : 'Não se aplica',
      "detalhes_reclamacao_conhecimento": conhecimentoFatoSaude === 'Sim' ? (clientData.detalhesFato || clientData.fatoPotencialDetalhe || clientData.fatoDetalhe || 'Não informado') : 'Sem fatos conhecidos',
      "valor_indenizado_conhecimento": conhecimentoFatoSaude === 'Sim' ? (clientData.valorEstimadoFato ? (String(clientData.valorEstimadoFato).startsWith('R$') ? clientData.valorEstimadoFato : formatMoeda(clientData.valorEstimadoFato)) : 'R$ 0,00') : 'R$ 0,00',
      "status_atual_conhecimento": conhecimentoFatoSaude === 'Sim' ? (clientData.statusFato || 'Regular') : 'Regular',

      // Corretora e Cidade
      "cidadeCorretora": corretoraInfo.cidade || 'São Paulo',
      "corretora": corretoraInfo.nomeFantasia || corretoraInfo.razaoSocial,

      // Variáveis do Plano / Parcelamento / Condições Comerciais
      "tipo": clientData.valorCobertura || 'Plano Padrão',
      "valor": formatMoeda(valorTotal),
      "valorTotalParcelado": formatMoeda(valorTotalComJuros),
      "planoParcela": clientData.parcela && Number(clientData.parcela) > 1 ? `${clientData.parcela} parcelas` : '1x',
      "planoValorParcela": formatMoeda(clientData.valorParcela || valorTotal),
      "franquia": valorFranquiaPlano,
      "planoFranquia": valorFranquiaPlano,

      // Variáveis de data
      "dia": dia,
      "mes": mes,
      "ano": ano
    };

    // Limpa undefined/null para um espaço
    const dataArray = Object.entries(variaveis).map(([de, para]) => ({
      de,
      para: para === undefined || para === null || para === '' ? ' ' : String(para)
    }));

    let docToken = '';
    let signUrl = '';
    let signUrlCorretora = '';
    let signUrlProponente = '';
    let resJson: any = null;

    if (isDynamicPdf) {
      // 6a. Geração de contrato dinâmico em PDF com marca e dados da corretora (Gotenberg com fallback transparente)
      const pdfData = await gerarContratoPdfGotenberg(cotacao.id);

      const signatarioProponente = {
        nome: pdfData.signatarioProponente?.nome || cotacao.client_name,
        email: pdfData.signatarioProponente?.email || cotacao.client_email || 'suporte@duolife.net.br',
        phone: pdfData.signatarioProponente?.phone || cotacao.client_phone || null,
        order: undefined, // Sem restrição sequencial: proponente assina imediatamente no checkout/portal
        signaturePattern: '{{assinatura_proponente}}',
        sendAutomaticEmail: false, // Cliente já está na tela assinando
      };

      const signatarioCorretora = {
        nome: pdfData.signatarioCorretora?.nome || 'Corretora',
        email: pdfData.signatarioCorretora?.email || 'contato@net4life.com.br',
        phone: pdfData.signatarioCorretora?.phone || null,
        order: undefined, // Sem restrição sequencial: a corretora assina de forma independente
        signaturePattern: '{{assinatura_corretora}}',
        sendAutomaticEmail: true,
      };

      const directDoc = await criarDocumentoZapSignDireto({
        base64Pdf: pdfData.base64,
        docName: pdfData.docName,
        externalId: cotacao.id,
        deadlineAt: deadlineZapSign,
        signatarios: [signatarioProponente, signatarioCorretora],
      });
      docToken = directDoc.docToken;

      const proponenteSigner =
        directDoc.signers?.find(
          (s) =>
            (signatarioProponente.email && s.email?.toLowerCase() === signatarioProponente.email.toLowerCase()) ||
            (signatarioProponente.nome && s.name?.toLowerCase().includes(signatarioProponente.nome.toLowerCase()))
        ) || directDoc.signers?.[0];

      const corretoraSigner =
        directDoc.signers?.find((s) => s !== proponenteSigner) || directDoc.signers?.[1];

      signUrlProponente = proponenteSigner?.signUrl || directDoc.signUrl || '';
      signUrlCorretora = corretoraSigner?.signUrl || '';
      signUrl = signUrlProponente;
      resJson = directDoc.rawPayload;
    } else {
      // 6b. POST para o ZapSign via modelo pré-configurado (fluxo padrão existente mantido 100% inalterado)
      const sandbox = zapConfig.isSandbox;
      const payload = {
        template_id: templateId,
        signer_name: cotacao.client_name,
        signer_email: cotacao.client_email || 'suporte@duolife.net.br',
        send_automatic_email: false,
        send_automatic_whatsapp: false,
        sandbox,
        lang: "pt-br",
        deadline_at: deadlineZapSign,
        data: dataArray,
        external_id: cotacao.id
      };

      const token = sanitizeApiToken(zapConfig.apiToken);
      const baseUrl = zapConfig.baseUrl;

      if (!token) {
        return Response.json({ error: 'Token da ZapSign não configurado' }, { status: 500 });
      }

      const response = await fetch(`${baseUrl}/models/create-doc/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();

      if (!response.ok) {
        logger.error({ status: response.status, body: responseText }, 'api.portal.gerar-contrato.zapsign_failed');
        let friendlyError = `Falha na API da ZapSign: ${responseText}`;
        if (responseText.includes('API token not found') || responseText.includes('Token da API não encontrado')) {
          const ambAtual = zapConfig.isSandbox ? 'Sandbox (Testes)' : 'Produção Real';
          friendlyError = `Falha de autenticação na ZapSign: O Token de API informado não foi localizado no ambiente ${ambAtual}. Verifique no painel administrativo (/admin/chaves-api) se o ambiente selecionado corresponde à conta onde o token foi gerado (app.zapsign.com.br para Produção ou sandbox.app.zapsign.com.br para Sandbox).`;
        }
        return Response.json({ error: friendlyError }, { status: 400 });
      }

      resJson = JSON.parse(responseText);
      docToken = resJson.token;
      if (!docToken) {
        logger.error({ cotacaoId: cotacao.id, body: responseText }, 'api.portal.gerar-contrato.zapsign_sem_token');
        return Response.json({ error: 'Resposta inesperada da ZapSign ao criar documento' }, { status: 502 });
      }
      const signersList = Array.isArray(resJson.signers) ? resJson.signers : [];
      signUrlProponente = signersList[0]?.sign_url || '';
      signUrlCorretora = signersList[1]?.sign_url || '';
      signUrl = signUrlProponente;
    }

    // 7. Atualiza a cotação no Banco com identificação dinâmica de assinaturas
    const totalAssinaturas = isDynamicPdf ? 2 : 1;
    const assinaturasNecessarias = isDynamicPdf ? ['cliente', 'corretora'] : ['cliente'];
    const statusInicialAssinatura = isDynamicPdf ? 'faltam_ambas' : 'falta_cliente';

    clientData.contratoToken = docToken;
    clientData.signUrl = signUrl;
    clientData.signUrlProponente = signUrlProponente || signUrl;
    if (isDynamicPdf && signUrlCorretora) {
      clientData.signUrlCorretora = signUrlCorretora;
    } else {
      delete clientData.signUrlCorretora;
    }
    clientData.statusAssinatura = statusInicialAssinatura;
    clientData.totalAssinaturas = totalAssinaturas;
    clientData.assinaturasNecessarias = assinaturasNecessarias;
    clientData.clienteAssinou = false;
    // Para contratos de 1 assinatura (template), a corretora não assina (já atendido)
    clientData.corretoraAssinou = isDynamicPdf ? false : true;
    clientData.contratoGeradoEm = new Date().toISOString();
    clientData.contratoPrazoLimite = deadlineIso;
    clientData.contratoModo = isDynamicPdf ? 'dynamic_pdf' : 'template';
    clientData.contratoTemplateId = isDynamicPdf ? 'dynamic_pdf' : templateId;
    clientData.contratoTipo = tipoContrato;
    // Limpa estado de desatualização da minuta
    clientData.minutaDesatualizada = false;
    delete clientData.minutaDesatualizadaMotivo;
    delete clientData.minutaAlteradaEm;

    await sql`
      UPDATE cotacoes
      SET
        status = 'contrato_gerado',
        client_data = ${JSON.stringify(clientData)}::jsonb,
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    // Garante que qualquer outro documento anterior não cancelado saia do estado ativo
    await sql`
      UPDATE signature_documents
      SET status = 'cancelled', updated_at = NOW()
      WHERE cotacao_id = ${cotacao.id}
        AND external_document_id != ${docToken}
        AND status NOT IN ('cancelled', 'refused', 'expired')
    `;

    await sql`
      INSERT INTO signature_documents (
        cotacao_id,
        client_id,
        provider,
        external_document_id,
        template_id,
        sign_url,
        status,
        deadline_at,
        raw_payload,
        updated_at
      )
      VALUES (
        ${cotacao.id},
        ${cotacao.client_id || null},
        'zapsign',
        ${docToken},
        ${isDynamicPdf ? 'dynamic_pdf' : templateId},
        ${signUrl || null},
        'pending',
        ${deadlineIso},
        ${JSON.stringify(resJson)}::jsonb,
        NOW()
      )
      ON CONFLICT (provider, external_document_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        sign_url = EXCLUDED.sign_url,
        deadline_at = EXCLUDED.deadline_at,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `;

    // 8. Disparo do Gatilho PROPOSTA_CRIADA para envio automático do e-mail com contrato para assinatura
    try {
      const [clientRow] = cotacao.client_id
        ? await sql<{ full_name: string; email: string; document_number: string; phone: string }[]>`
            SELECT full_name, email, document_number, phone FROM insurance_clients WHERE id = ${cotacao.client_id} LIMIT 1
          `
        : [];

      const [partnerRow] = cotacao.partner_id
        ? await sql<{ nome: string; email: string; codigo_venda?: string }[]>`
            SELECT
              COALESCE(p.nome_fantasia, p.razao_social) AS nome,
              COALESCE(NULLIF(p.email, ''), pu.email) AS email,
              p.metadata->'whiteLabel'->>'wixCode' AS codigo_venda
            FROM partners p
            LEFT JOIN partner_users pu ON pu.partner_id = p.id AND pu.is_active = true
            WHERE p.id = ${cotacao.partner_id}
            ORDER BY pu.created_at ASC
            LIMIT 1
          `
        : [];

      const [vendedorRow] = cotacao.partner_user_id
        ? await sql<{ id: string; nome: string; email: string }[]>`
            SELECT id, name AS nome, email
            FROM partner_users
            WHERE id = ${cotacao.partner_user_id}
            LIMIT 1
          `
        : [];

      const clientName = clientRow?.full_name || cotacao.client_name || clientData.nome || 'Cliente';
      const clientEmail = clientRow?.email || cotacao.client_email || clientData.email;
      const clientDoc = clientRow?.document_number || cotacao.client_cpf_cnpj || clientData.cpf || clientData.cnpj || '';
      const clientPhone = clientRow?.phone || cotacao.client_phone || clientData.celular || clientData.telefone || '';

      const dispatchContext = {
        eventType: 'PROPOSTA_CRIADA',
        contextId: cotacao.id,
        cliente: {
          nome: clientName,
          email: clientEmail,
          documento: clientDoc,
          telefone: clientPhone,
        },
        parceiro: partnerRow ? {
          id: cotacao.partner_id,
          nome: partnerRow.nome,
          email: partnerRow.email,
          codigoVenda: partnerRow.codigo_venda,
        } : undefined,
        vendedor: vendedorRow ? {
          id: vendedorRow.id,
          nome: vendedorRow.nome,
          email: vendedorRow.email,
        } : undefined,
        cotacao: {
          id: cotacao.id,
          status: 'contrato_gerado',
          premio_final: valorTotal,
          cobertura: Number(cotacao.importancia_segurada) || (isMedico ? 250000 : 100000),
          produto_codigo: isMedico ? 'RC-MED-001' : 'RC-ADV-001',
          produto_nome: isMedico ? 'RC Profissional — Médicos & Saúde' : 'RC Profissional — Advogados & Escritórios',
        },
        dados: {
          docToken,
          signUrl,
          link_assinatura: signUrl,
          link_proposta: signUrl,
          link_contrato: signUrl,
          valor: valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          valor_parcela: valorParcelaContrato.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          qtd_parcelas: qtdParcelasContrato,
          cobertura: (Number(cotacao.importancia_segurada) || 100000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          parceiro_nome: partnerRow?.nome || 'DuoLife',
        },
      };

      const dispatchResult = await dispatchDomainEvent('PROPOSTA_CRIADA', dispatchContext);
      logger.info(
        {
          cotacaoId: cotacao.id,
          clientEmail,
          actionsExecuted: dispatchResult.actionsExecutedCount,
          errors: dispatchResult.errors,
        },
        'api.portal.gerar-contrato.trigger_dispatched'
      );
    } catch (dispatchErr) {
      logger.error({ dispatchErr, cotacaoId: cotacao.id }, 'api.portal.gerar-contrato.trigger_failed');
    }

    return Response.json({
      ok: true,
      docToken,
      signUrl,
      signUrlCorretora: isDynamicPdf ? (signUrlCorretora || clientData.signUrlCorretora || null) : null,
      signUrlProponente: signUrlProponente || signUrl,
      statusAssinatura: statusInicialAssinatura,
      totalAssinaturas,
      assinaturasNecessarias,
      contratoModo: isDynamicPdf ? 'dynamic_pdf' : 'template',
      clienteAssinou: false,
      corretoraAssinou: isDynamicPdf ? false : true,
    });

  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'api.portal.gerar-contrato.failed');
    return Response.json({ error: 'Erro interno ao gerar contrato' }, { status: 500 });
  }
}
