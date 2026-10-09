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

// Função auxiliar para normalizar e mapear o identificador de plano do Wix
function normalizarIdentificadorPlano(val: any): string {
  if (!val) return '100k';
  const str = String(val).toLowerCase().trim();
  if (str.includes('100') || str.includes('100k') || str.includes('cem')) return '100k';
  if (str.includes('200') || str.includes('200k') || str.includes('duzentos')) return '200k';
  if (str.includes('300') || str.includes('300k') || str.includes('trezentos')) return '300k';
  if (str.includes('500') || str.includes('500k') || str.includes('quinhentos')) return '500k';
  return str;
}

// Validação dos dados recebidos do formulário do Wix com tolerância a múltiplos formatos
const wixCotacaoSchema = z.object({
  // Identificação e Dados Pessoais
  nome: z.string().trim().min(2, 'Nome deve conter pelo menos 2 caracteres'),
  cpfCnpj: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/\D/g, ''))
    .refine((v) => v.length === 11 || v.length === 14, {
      message: 'CPF/CNPJ deve conter 11 (CPF) ou 14 (CNPJ) dígitos numéricos',
    }),
  email: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null),
      z.string().email('E-mail em formato inválido').nullable().optional()
    ),
  celular: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v ? String(v).replace(/\D/g, '') : null)),
  dataNascto: z
    .union([z.string(), z.date(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v) : null)),
  estadoCivil: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  sexo: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),

  // Endereço
  cep: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v ? String(v).replace(/\D/g, '') : null)),
  logradouro: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  numero: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v !== undefined && v !== null ? String(v) : null)),
  complemento: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  bairro: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  cidade: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  uf: z.unknown().optional().nullable().transform((v) => (v ? String(v).trim().toUpperCase() : null)),

  // OAB e Informações Profissionais
  oab: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v !== undefined && v !== null ? String(v) : null)),
  oabUf: z.unknown().optional().nullable().transform((v) => (v ? String(v).trim().toUpperCase() : null)),
  associadoEscritorio: z.unknown().optional().nullable(),
  nomeEscritorio: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  cnpjEscritorio: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v ? String(v).replace(/\D/g, '') : null)),
  faturamentoAnual: z.union([z.number(), z.string()]).optional().nullable(),
  especialidades: z.union([z.array(z.string()), z.string()]).optional().nullable(),

  // PPE (Pessoa Politicamente Exposta)
  ppe: z.unknown().optional().nullable(),
  ppeCargo: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  ppeParentesco: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  ppeNome: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  ppeCpf: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),

  // Análise de Risco / Sinistros
  propostaRecusada: z.unknown().optional().nullable(),
  propostaDetalhe: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  reclamacaoProfissional: z.unknown().optional().nullable(),
  reclamacaoDetalhe: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  investigacaoAutoridade: z.unknown().optional().nullable(),
  investigacaoDetalhe: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  fatoTerceiros: z.unknown().optional().nullable(),
  fatoDetalhe: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  pagouReclamacao: z.unknown().optional().nullable(),
  pagouDetalhe: z.unknown().optional().nullable().transform((v) => (v ? String(v) : null)),
  questionarioRisco: z.record(z.string(), z.unknown()).optional().nullable(),

  // Plano e Condições Comerciais
  plano: z.string().trim().min(1, 'Identificador do plano é obrigatório'),
  parcelas: z.coerce.number().int().min(1).max(6).default(1),
  formaPagamento: z.string().trim().default('BOLETO'),
  cupomCodigo: z.unknown().optional().nullable().transform((v) => (v ? String(v).trim().toUpperCase() : null)),

  // Parceiro e Rastreabilidade
  partnerCode: z.unknown().optional().nullable().transform((v) => (v ? String(v).trim() : null)),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateWixRequest(req);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const rawBody = await req.json().catch(() => ({}));

    // Suporte e mapeamento de variações de campos do formulário e sessão do Wix
    const payloadNormalized = {
      ...rawBody,
      nome: rawBody.nome || rawBody.clientName || rawBody.name || rawBody.nomeProponente,
      cpfCnpj: rawBody.cpfCnpj || rawBody.cpf || rawBody.cnpj || rawBody.clientCpfCnpj || rawBody.cpfProponente,
      email: rawBody.email || rawBody.clientEmail || rawBody.mail,
      celular: rawBody.celular || rawBody.telefone || rawBody.phone || rawBody.clientPhone || rawBody.whatsapp,
      dataNascto: rawBody.dataNascto || rawBody.dataNascimento || rawBody.birthDate || rawBody.nascimento,
      cep: rawBody.cep || rawBody.zipCode,
      logradouro: rawBody.logradouro || rawBody.endereco || rawBody.rua,
      numero: rawBody.numero !== undefined && rawBody.numero !== null ? String(rawBody.numero) : rawBody.num,
      complemento: rawBody.complemento || rawBody.comp,
      bairro: rawBody.bairro,
      cidade: rawBody.cidade || rawBody.municipio,
      uf: rawBody.uf || rawBody.estado,
      oab: rawBody.oab || rawBody.oabNumero || rawBody.registroProfissionalNumero || rawBody.registroProfissional,
      oabUf: rawBody.oabUf || rawBody.registroProfissionalUf || rawBody.oabEstado,
      plano: normalizarIdentificadorPlano(
        rawBody.plano || rawBody.tipo || rawBody.tipoDePlano || rawBody.planoId || rawBody.valorCobertura
      ),
      parcelas: rawBody.parcelas || rawBody.qtdParcelas || rawBody.parcela || 1,
      cupomCodigo: rawBody.cupomCodigo || rawBody.cupom || rawBody.couponCode || null,
      partnerCode: rawBody.partnerCode || rawBody.codigoParceiro || rawBody.codigoVenda || rawBody.wixCode || rawBody.ref || null,
    };

    const parseResult = wixCotacaoSchema.safeParse(payloadNormalized);

    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const detalheMsg = Object.entries(fieldErrors)
        .map(([k, msgs]) => `${k}: ${(msgs as string[]).join(', ')}`)
        .join('; ');

      logger.warn({ fieldErrors, rawBody }, 'wix.cotacao.validacao_falhou');

      return NextResponse.json(
        {
          success: false,
          error: `Dados de cotação inválidos (${detalheMsg})`,
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
      partnerId: partner.id,
      partnerName: partner.name,
      corretoraId: partner.corretoraId,
      corretoraNome: partner.corretoraNome,
      origem: 'wix_s2s',
      polo: 'net4life_wix',
    };

    const sourceToken = `wix_${crypto.randomUUID().slice(0, 10)}`;

    // 7. Inserção da Cotação em cotacoes com status 'rascunho'
    const [cotacao] = await sql<any[]>`
      INSERT INTO cotacoes (
        client_id,
        partner_id,
        corretora_id,
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
        ${partner.corretoraId},
        ${productId},
        ${data.nome},
        ${data.cpfCnpj},
        ${data.email ?? null},
        ${data.celular ?? null},
        ${importanciaSegurada ?? null},
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
        partnerName: partner.name,
        corretoraId: partner.corretoraId,
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
      corretoraId: partner.corretoraId,
      corretoraNome: partner.corretoraNome,
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
