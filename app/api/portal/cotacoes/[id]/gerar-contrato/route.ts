import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { getAccessibleQuoteById } from '@/lib/access';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    // 1. Busca a cotação
    const cotacao = publicToken
      ? (await sql`SELECT * FROM cotacoes WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${targetPartnerId}`)[0]
      : await getAccessibleQuoteById(id, user!);

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const clientData = cotacao.client_data || {};
    const valorTotal = Number(cotacao.premio_final || cotacao.premio_calculado || clientData.valor || 0);
    const qtdParcelasContrato = Number(clientData.parcela) || 1;
    const valorParcelaContrato = Number(clientData.valorParcela) || valorTotal;
    // Quando parcelado, o total efetivamente cobrado (com juros já embutidos na parcela) pode ser
    // maior que o valor à vista — não usar valorTotal sozinho como "o que o cliente paga".
    const valorTotalComJuros = qtdParcelasContrato > 1 ? valorParcelaContrato * qtdParcelasContrato : valorTotal;

    if (!valorTotal || valorTotal <= 0) {
      logger.error({ cotacaoId: cotacao.id }, 'api.portal.gerar-contrato.valor_invalido');
      return Response.json({ error: 'Cotação sem valor de prêmio calculado — não é possível gerar contrato' }, { status: 422 });
    }

    // Idempotência: já existe um contrato gerado para esta cotação, não cria outro documento no ZapSign —
    // a menos que o link de assinatura já tenha passado do prazo de validade do ZapSign (~30 dias), caso
    // em que geramos um novo documento em vez de reaproveitar um signUrl morto indefinidamente.
    const SIGN_URL_MAX_AGE_DAYS = 25;
    const contratoGeradoEm = clientData.contratoGeradoEm ? new Date(clientData.contratoGeradoEm) : null;
    const signUrlExpirado = contratoGeradoEm
      ? (Date.now() - contratoGeradoEm.getTime()) > SIGN_URL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
      : false;

    if (clientData.contratoToken && !signUrlExpirado) {
      return Response.json({
        ok: true,
        docToken: clientData.contratoToken,
        signUrl: clientData.signUrl,
        alreadyExisted: true,
      });
    }

    // 2. Determina o template do ZapSign
    // Prioridade: plano 100k sempre usa o template 100k (mesmo em renovação — 61% das renovações reais
    // são do plano 100k, que já tem coleta de dados simplificada compatível). Renovação de outros planos
    // usa o template de renovação; senão, o template oficial.
    const isRenovacao = clientData.renovacao === true || clientData.renovacao === 'true' || clientData.renovacao === 'Sim';
    const isPlano100k = clientData.tipo === '100k';
    const templateId = isPlano100k
      ? process.env.ZAPSIGN_TEMPLATE_100K
      : isRenovacao
        ? process.env.ZAPSIGN_TEMPLATE_RENOVACAO
        : process.env.ZAPSIGN_TEMPLATE_OFICIAL;

    if (!templateId) {
      return Response.json({ error: 'Template do ZapSign não configurado' }, { status: 422 });
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
            SELECT payload FROM wix_items
            WHERE wix_collection_id IN (
              SELECT id FROM wix_collections WHERE collection_id = 'CUPOMPROMOCIONAL'
            )
            AND is_active = true
          `;
          const cupomData = cupomItens
            .map(r => {
              try {
                const parsed = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
                return parsed?.item?.data || null;
              } catch {
                return null;
              }
            })
            .find(c => c && String(c.codigo).toLowerCase() === cupomCodigo.toLowerCase());

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
    const areaAtuacao = clientData.atuacao ? String(clientData.atuacao).split(':') : [];
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

    // 5. Monta o dicionário de variáveis para o template do ZapSign
    const variaveis: Record<string, string> = {
      // Dados Pessoais
      "nome": cotacao.client_name,
      "email": cotacao.client_email || '',
      "celular": cotacao.client_phone || '',
      "cpf": cotacao.client_cpf_cnpj,
      "oab": clientData.oab || '',
      "dataNascto": formatData(clientData.dataNascto),

      // Endereço
      "logradouro": clientData.logradouro || '',
      "numero": String(clientData.numero || ''),
      "complemento": clientData.complemento || '',
      "cep": clientData.cep || '',
      "bairro": clientData.bairro || '',
      "cidade": clientData.cidade || '',
      "uf": clientData.uf || '',
      "lgpd": "X",

      // Dados Profissionais
      "inicioProfissional": formatData(clientData.dataAtividade),
      "escritorio": clientData.escritorioAssociado || '',
      "titularidade": clientData.titularidade || '',
      "faturamentoAntes": clientData.faturamentoAntes || '',
      "faturamentoDepois": clientData.faturamentoDepois || '',

      // Áreas de Atuação
      "civil": checkArea("civil"),
      "propriedadeIndustrial": checkArea("propriedadeIndustrial"),
      "bancarioFinanceiro": checkArea("bancarioFinanceiro"),
      "criminal": checkArea("criminal"),
      "tributaria": checkArea("tributaria"),
      "previdenciario": checkArea("previdenciario"),
      "direitoInternacional": checkArea("direitoInternacional"),
      "fusoesAquisicoes": checkArea("fusoesAquisicoes"),
      "direitoEmpresarial": checkArea("direitoEmpresarial"),
      "trabalhista": checkArea("trabalhista"),
      "societario": checkArea("societario"),
      "outros": checkArea("outros"),

      // PPE
      "ppeCargos": clientData.ppeCargos === 'Sim' || clientData.ppeCargos === true ? 'Sim' : 'Não',
      "ppeRepresenta": clientData.ppeRepresenta === 'Sim' || clientData.ppeRepresenta === true ? 'Sim' : 'Não',
      "ppeCargoSelect": ppeDescricao || ' ',

      // Dados de seguro anterior (opcional)
      "seguradora": clientData.seguradora || ' ',
      "franquia": clientData.franquiaAnterior || ' ',
      "vigencia": clientData.vigencia ? formatData(clientData.vigencia) : ' ',
      "premio": clientData.premio || ' ',
      "limite": clientData.limite || ' ',
      "dataRetroativa": clientData.dataRetroativa ? formatData(clientData.dataRetroativa) : 'Início de Vigência',

      // Variáveis do Plano / Parcelamento
      // "valor" é o prêmio à vista; "valorTotalParcelado" é o total efetivamente cobrado quando parcelado
      // com juros (ex: 6x já embute 2% a.m.) — os dois podem divergir, por isso expomos ambos ao contrato.
      "tipo": clientData.valorCobertura || 'Plano Padrão',
      "valor": formatMoeda(valorTotal),
      "valorTotalParcelado": formatMoeda(valorTotalComJuros),
      "planoParcela": clientData.parcela && Number(clientData.parcela) > 1 ? `${clientData.parcela} parcelas` : '1x',
      "planoValorParcela": formatMoeda(clientData.valorParcela || valorTotal),
      "planoFranquia": clientData.planoFranquia || ' ',

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

    // 6. Faz o POST para o ZapSign
    const sandbox = process.env.ZAPSIGN_SANDBOX === 'true';
    const payload = {
      template_id: templateId,
      signer_name: cotacao.client_name,
      signer_email: cotacao.client_email || 'suporte@duolife.net.br',
      send_automatic_email: false,
      send_automatic_whatsapp: false,
      sandbox,
      lang: "pt-br",
      data: dataArray,
      external_id: cotacao.id
    };

    const token = process.env.ZAPSIGN_API_TOKEN;
    const baseUrl = process.env.ZAPSIGN_BASE_URL || 'https://sandbox.api.zapsign.com.br/api/v1';

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
      return Response.json({ error: `Falha na API da ZapSign: ${responseText}` }, { status: 400 });
    }

    const resJson = JSON.parse(responseText);
    const docToken = resJson.doc_token;
    const signUrl = resJson.signers?.[0]?.sign_url || '';

    // 7. Atualiza a cotação no Banco
    clientData.contratoToken = docToken;
    clientData.signUrl = signUrl;
    clientData.contratoGeradoEm = new Date().toISOString();

    await sql`
      UPDATE cotacoes
      SET
        status = 'contrato_gerado',
        client_data = ${JSON.stringify(clientData)},
        updated_at = NOW()
      WHERE id = ${cotacao.id}
    `;

    // Se estamos regenerando por expiração, o documento antigo precisa sair do estado "ativo"
    // antes do insert abaixo, senão colide com o índice único parcial (1 documento ativo por cotação).
    if (signUrlExpirado) {
      await sql`
        UPDATE signature_documents
        SET status = 'expired', updated_at = NOW()
        WHERE cotacao_id = ${cotacao.id} AND status NOT IN ('cancelled', 'refused', 'expired')
      `;
    }

    await sql`
      INSERT INTO signature_documents (
        cotacao_id,
        client_id,
        provider,
        external_document_id,
        template_id,
        sign_url,
        status,
        raw_payload,
        updated_at
      )
      VALUES (
        ${cotacao.id},
        ${cotacao.client_id || null},
        'zapsign',
        ${docToken},
        ${templateId},
        ${signUrl || null},
        'pending',
        ${JSON.stringify(resJson)}::jsonb,
        NOW()
      )
      ON CONFLICT (provider, external_document_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        sign_url = EXCLUDED.sign_url,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `;

    return Response.json({
      ok: true,
      docToken,
      signUrl
    });

  } catch (err: unknown) {
    logger.error({ err, cotacaoId: id }, 'api.portal.gerar-contrato.failed');
    return Response.json({ error: 'Erro interno ao gerar contrato' }, { status: 500 });
  }
}
