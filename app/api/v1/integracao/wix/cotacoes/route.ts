import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { authenticateWixRequest, resolvePartnerForWix } from '@/lib/wix-integration-auth';
import { upsertInsuranceClient } from '@/lib/insurance-ops';
import { calcularPrecoServidor } from '@/lib/pricing';
import { rcAdvogadosConfig } from '@/lib/product-schemas';
import { parseCurrencyToNumber } from '@/lib/format';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

// Validação dos dados recebidos do formulário do Wix
const wixCotacaoSchema = z.object({
  // Identificação e Dados Pessoais
  nome: z.string().trim().min(2, 'Nome deve conter pelo menos 2 caracteres'),
  cpfCnpj: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 11 || v.length === 14, {
      message: 'CPF/CNPJ deve conter 11 (CPF) ou 14 (CNPJ) dígitos numéricos',
    }),
  email: z
    .string()
    .trim()
    .email('E-mail em formato inválido')
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null)),
  celular: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/\D/g, '') : null)),
  dataNascto: z.string().trim().optional().nullable(),
  estadoCivil: z.string().trim().optional().nullable(),
  sexo: z.string().trim().optional().nullable(),

  // Endereço
  cep: z.string().trim().optional().nullable().transform((v) => (v ? v.replace(/\D/g, '') : null)),
  logradouro: z.string().trim().optional().nullable(),
  numero: z.string().trim().optional().nullable(),
  complemento: z.string().trim().optional().nullable(),
  bairro: z.string().trim().optional().nullable(),
  cidade: z.string().trim().optional().nullable(),
  uf: z.string().trim().optional().nullable(),

  // OAB e Informações Profissionais
  oab: z.string().trim().optional().nullable(),
  oabUf: z.string().trim().optional().nullable(),
  associadoEscritorio: z.union([z.boolean(), z.string()]).optional().nullable(),
  nomeEscritorio: z.string().trim().optional().nullable(),
  cnpjEscritorio: z.string().trim().optional().nullable().transform((v) => (v ? v.replace(/\D/g, '') : null)),
  faturamentoAnual: z.union([z.number(), z.string()]).optional().nullable(),
  especialidades: z.union([z.array(z.string()), z.string()]).optional().nullable(),

  // PPE (Pessoa Politicamente Exposta)
  ppe: z.union([z.boolean(), z.string()]).optional().nullable(),
  ppeCargo: z.string().trim().optional().nullable(),
  ppeParentesco: z.string().trim().optional().nullable(),
  ppeNome: z.string().trim().optional().nullable(),
  ppeCpf: z.string().trim().optional().nullable(),

  // Análise de Risco / Sinistros
  propostaRecusada: z.union([z.boolean(), z.string()]).optional().nullable(),
  propostaDetalhe: z.string().trim().optional().nullable(),
  reclamacaoProfissional: z.union([z.boolean(), z.string()]).optional().nullable(),
  reclamacaoDetalhe: z.string().trim().optional().nullable(),
  investigacaoAutoridade: z.union([z.boolean(), z.string()]).optional().nullable(),
  investigacaoDetalhe: z.string().trim().optional().nullable(),
  fatoTerceiros: z.union([z.boolean(), z.string()]).optional().nullable(),
  fatoDetalhe: z.string().trim().optional().nullable(),
  pagouReclamacao: z.union([z.boolean(), z.string()]).optional().nullable(),
  pagouDetalhe: z.string().trim().optional().nullable(),
  questionarioRisco: z.record(z.string(), z.unknown()).optional().nullable(),

  // Plano e Condições Comerciais
  plano: z.string().trim().min(1, 'Identificador do plano é obrigatório'),
  parcelas: z.coerce.number().int().min(1).max(6).default(1),
  formaPagamento: z.string().trim().default('BOLETO'),
  cupomCodigo: z.string().trim().optional().nullable(),

  // Parceiro e Rastreabilidade
  partnerCode: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const rawBody = await req.json().catch(() => ({}));

    // Suporte a variações de campos do Wix
    const payloadNormalized = {
      ...rawBody,
      nome: rawBody.nome || rawBody.clientName || rawBody.name,
      cpfCnpj: rawBody.cpfCnpj || rawBody.cpf || rawBody.cnpj || rawBody.clientCpfCnpj,
      email: rawBody.email || rawBody.clientEmail,
      celular: rawBody.celular || rawBody.telefone || rawBody.phone || rawBody.clientPhone,
      dataNascto: rawBody.dataNascto || rawBody.dataNascimento || rawBody.birthDate,
      oab: rawBody.oab || rawBody.oabNumero || rawBody.registroProfissionalNumero,
      oabUf: rawBody.oabUf || rawBody.registroProfissionalUf || rawBody.oabEstado,
      plano: String(rawBody.plano || rawBody.tipoDePlano || rawBody.planoId || '').toLowerCase(),
      parcelas: rawBody.parcelas || rawBody.qtdParcelas || 1,
      cupomCodigo: rawBody.cupomCodigo || rawBody.cupom || rawBody.couponCode || null,
      partnerCode: rawBody.partnerCode || rawBody.codigoParceiro || rawBody.codigoVenda || rawBody.wixCode || rawBody.ref || null,
    };

    const parseResult = wixCotacaoSchema.safeParse(payloadNormalized);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Dados de cotação inválidos',
          detalhes: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // 1. Resolução do Parceiro
    const partner = await resolvePartnerForWix(data.partnerCode);

    // 2. Resolução do Produto RC Advogados
    let productId = 'prod-rc-001';
    try {
      const [prodRow] = await sql<any[]>`
        SELECT id FROM products
        WHERE flow_key = 'rc-advogados' OR code = 'RC-001'
        LIMIT 1
      `;
      if (prodRow?.id) {
        productId = prodRow.id;
      }
    } catch (err) {
      logger.warn({ err }, 'wix.cotacao.resolve_product_warn');
    }

    // 3. Cálculo de Preço Canônico Oficial no Servidor
    const preco = await calcularPrecoServidor({
      tipoDePlano: data.plano,
      qtdParcelasSolicitada: data.parcelas,
      cupomCodigo: data.cupomCodigo,
      flowKey: 'rc-advogados',
      productId,
    });

    if (!preco) {
      return NextResponse.json(
        {
          success: false,
          error: `Plano '${data.plano}' não encontrado ou cálculo de prêmio inválido.`,
        },
        { status: 400 }
      );
    }

    // 4. Resolução da Cobertura (Importância Segurada)
    const planoDef = rcAdvogadosConfig.planos.find((p) => p.tipoDePlano === data.plano);
    const importanciaSegurada = planoDef ? parseCurrencyToNumber(planoDef.cobertura, 0) : null;

    // 5. Cadastro ou Atualização do Cliente em insurance_clients
    const client = await upsertInsuranceClient({
      documentNumber: data.cpfCnpj,
      fullName: data.nome,
      email: data.email,
      phone: data.celular,
      birthDate: data.dataNascto,
      metadata: {
        origem: 'wix_s2s',
        address: {
          cep: data.cep,
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          cidade: data.cidade,
          uf: data.uf,
        },
        profissional: {
          oab: data.oab,
          oabUf: data.oabUf,
          associadoEscritorio: data.associadoEscritorio,
          nomeEscritorio: data.nomeEscritorio,
          cnpjEscritorio: data.cnpjEscritorio,
          faturamentoAnual: data.faturamentoAnual,
          especialidades: data.especialidades,
        },
      },
    });

    // 6. Preparação dos dados adicionais armazenados na Cotação
    const clientData = {
      ...data,
      tipo: data.plano,
      tipoDePlano: data.plano,
      parcela: String(preco.qtdParcelas),
      qtdParcelas: preco.qtdParcelas,
      valor: preco.valorTotal,
      valorTotal: preco.valorTotal,
      valorParcela: preco.valorParcela,
      valorOriginal: preco.valorOriginal,
      descontoPercentual: preco.descontoPercentual,
      valorDesconto: preco.valorDesconto,
      formaPagamento: data.formaPagamento,
      partnerWixCode: data.partnerCode,
      partnerName: partner.name,
      origem: 'wix_s2s',
    };

    const sourceToken = `wix_${crypto.randomUUID().slice(0, 10)}`;

    // 7. Inserção da Cotação em cotacoes com status 'rascunho'
    const [cotacao] = await sql<any[]>`
      INSERT INTO cotacoes (
        client_id,
        partner_id,
        product_id,
        client_name,
        client_cpf_cnpj,
        client_email,
        client_phone,
        importancia_segurada,
        premio_calculado,
        premio_final,
        status,
        flow_type,
        source_token,
        client_data,
        valid_until,
        created_at,
        updated_at
      )
      VALUES (
        ${client.id},
        ${partner.id},
        ${productId},
        ${data.nome},
        ${data.cpfCnpj},
        ${data.email},
        ${data.celular},
        ${importanciaSegurada},
        ${preco.valorOriginal},
        ${preco.valorTotal},
        'rascunho',
        'wix_s2s',
        ${sourceToken},
        ${JSON.stringify(clientData)}::jsonb,
        CURRENT_DATE + interval '7 days',
        NOW(),
        NOW()
      )
      RETURNING id, status, premio_final, created_at
    `;

    logger.info(
      {
        cotacaoId: cotacao.id,
        clientId: client.id,
        partnerId: partner.id,
        plano: data.plano,
        valorTotal: preco.valorTotal,
        qtdParcelas: preco.qtdParcelas,
      },
      'wix.cotacao.criada_com_sucesso'
    );

    return NextResponse.json({
      success: true,
      cotacaoId: cotacao.id,
      valorTotal: preco.valorTotal,
      valorParcela: preco.valorParcela,
      parcelas: preco.qtdParcelas,
      partnerId: partner.id,
      partnerName: partner.name,
      status: 'rascunho',
    });
  } catch (err) {
    logger.error({ err }, 'wix.cotacao.criacao_falhou');
    return NextResponse.json(
      {
        success: false,
        error: 'Erro interno ao criar cotação a partir do Wix.',
      },
      { status: 500 }
    );
  }
}
