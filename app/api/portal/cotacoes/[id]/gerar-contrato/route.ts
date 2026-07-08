import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAuth();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    // 1. Busca a cotação
    let cotacaoResult;
    if (user.role === 'duolife_admin' || user.role === 'duolife_staff') {
      cotacaoResult = await sql`SELECT * FROM cotacoes WHERE id = ${id}`;
    } else {
      cotacaoResult = await sql`SELECT * FROM cotacoes WHERE id = ${id} AND partner_id = ${user.partnerId!}`;
    }
    const cotacao = cotacaoResult[0];

    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const clientData = cotacao.client_data || {};
    const valorTotal = Number(cotacao.premio_final || cotacao.premio_calculado || 0);

    // 2. Determina o template do ZapSign
    const isPlano100k = clientData.tipoDePlano === '100k' || clientData.tipo === '100k';
    const templateId = isPlano100k
      ? process.env.ZAPSIGN_TEMPLATE_100K
      : process.env.ZAPSIGN_TEMPLATE_OFICIAL;

    if (!templateId) {
      return Response.json({ error: 'Template do ZapSign não configurado' }, { status: 422 });
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
      "franquia": clientData.franquia || ' ',
      "vigencia": clientData.vigencia ? formatData(clientData.vigencia) : ' ',
      "premio": clientData.premio || ' ',
      "limite": clientData.limite || ' ',
      "dataRetroativa": clientData.dataRetroativa ? formatData(clientData.dataRetroativa) : 'Início de Vigência',

      // Variáveis do Plano / Parcelamento
      "tipo": clientData.valorCobertura || 'Plano Padrão',
      "valor": formatMoeda(valorTotal),
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
    const payload = {
      template_id: templateId,
      signer_name: cotacao.client_name,
      signer_email: cotacao.client_email || 'suporte@duolife.net.br',
      send_automatic_email: false,
      send_automatic_whatsapp: false,
      sandbox: true,
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

    await sql`
      UPDATE cotacoes
      SET
        status = 'contrato_gerado',
        client_data = ${JSON.stringify(clientData)},
        updated_at = NOW()
      WHERE id = ${cotacao.id}
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
