import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { upsertInsuranceClient } from '@/lib/insurance-ops';
import { parseJsonbField } from '@/lib/json-safe';
import { calcularPrecoServidor } from '@/lib/pricing';
import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const publicToken = req.headers.get('x-public-token');
  const { id } = await params;

  try {
    if (publicToken) {
      const [link] = await sql`
        SELECT partner_id FROM public_sale_links
        WHERE token = ${publicToken} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `;
      if (!link) return Response.json({ error: 'Token público inválido' }, { status: 401 });

      const [cotacao] = await sql`
        SELECT * FROM cotacoes
        WHERE id = ${id} AND source_token = ${publicToken} AND partner_id = ${link.partner_id}
        LIMIT 1
      `;
      if (!cotacao) return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
      return Response.json({ ok: true, cotacao });
    }

    const user = await verifyAuth();
    if (!user) return unauthorized();

    const accessible = await getAccessibleQuoteById(id, user);
    if (!accessible) {
      return Response.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const [cotacao] = await sql`
      SELECT
        c.*,
        p.name AS product_name,
        p.flow_key AS product_flow_key,
        part.nome_fantasia AS partner_name,
        part.razao_social AS partner_razao_social
      FROM cotacoes c
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN partners part ON part.id = c.partner_id
      WHERE c.id = ${id}
      LIMIT 1
    `;

    return Response.json({ ok: true, cotacao: cotacao || accessible });
  } catch (err) {
    logger.error({ err, id }, 'api.cotacoes.get_by_id.failed');
    return Response.json({ error: 'Erro interno ao buscar cotação' }, { status: 500 });
  }
}

function parseBirthDateInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  let y: string, m: string, d: string;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    [d, m, y] = trimmed.split('/');
  } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    [y, m, d] = trimmed.slice(0, 10).split('-');
  } else {
    return null;
  }

  const yearNum = parseInt(y, 10);
  const monthNum = parseInt(m, 10);
  const dayNum = parseInt(d, 10);
  if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) return null;
  if (yearNum < 1900 || yearNum > 2100 || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }

  return `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const user = await verifyAuth();
    if (!user) return unauthorized();

    const cotacao = await getAccessibleQuoteById(id, user);
    if (!cotacao) {
      return Response.json({ error: 'Cotação não encontrada ou acesso negado' }, { status: 404 });
    }

    const payload = await req.json();

    const currentClientData = parseJsonbField<Record<string, unknown>>(cotacao.client_data);
    const inputClientData = parseJsonbField<Record<string, unknown>>(payload.client_data);

    // Normalização dos dados cadastrais do cliente (aceita camelCase ou snake_case)
    const rawClientName = payload.clientName ?? payload.client_name ?? inputClientData.nome;
    const clientName = rawClientName !== undefined
      ? String(rawClientName).trim()
      : cotacao.client_name;

    let clientCpfCnpj = cotacao.client_cpf_cnpj;
    const rawCpfCnpj = payload.clientCpfCnpj ?? payload.client_cpf_cnpj ?? inputClientData.cpfCnpj;
    if (rawCpfCnpj !== undefined) {
      const normalizedDoc = String(rawCpfCnpj).replace(/\D/g, '');
      if (normalizedDoc) {
        if (normalizedDoc.length !== 11 && normalizedDoc.length !== 14) {
          return Response.json({ error: 'CPF deve conter 11 dígitos ou CNPJ deve conter 14 dígitos' }, { status: 400 });
        }
        clientCpfCnpj = normalizedDoc;
      }
    }

    const rawEmail = payload.clientEmail ?? payload.client_email ?? inputClientData.email;
    const clientEmail = rawEmail !== undefined
      ? (rawEmail ? String(rawEmail).trim().toLowerCase() : null)
      : cotacao.client_email;

    const rawPhone = payload.clientPhone ?? payload.client_phone ?? inputClientData.celular ?? inputClientData.telefone;
    const clientPhone = rawPhone !== undefined
      ? (rawPhone ? String(rawPhone).trim() : null)
      : cotacao.client_phone;

    // Data de nascimento
    let birthDate: string | null = null;
    const rawBirthDate = payload.birthDate ?? payload.birth_date ?? inputClientData.dataNascto ?? inputClientData.birth_date;
    if (rawBirthDate !== undefined) {
      birthDate = parseBirthDateInput(rawBirthDate);
    } else if (currentClientData.dataNascto) {
      birthDate = parseBirthDateInput(String(currentClientData.dataNascto));
    }

    // Endereço (aceita payload.address ou campos diretos em payload.client_data ou cotacao.client_data)
    const currentAddress = {
      cep: String(inputClientData.cep || currentClientData.cep || ''),
      logradouro: String(inputClientData.logradouro || inputClientData.rua || currentClientData.logradouro || currentClientData.rua || ''),
      numero: String(inputClientData.numero || currentClientData.numero || ''),
      complemento: String(inputClientData.complemento || currentClientData.complemento || ''),
      bairro: String(inputClientData.bairro || currentClientData.bairro || ''),
      cidade: String(inputClientData.cidade || currentClientData.cidade || ''),
      uf: String(inputClientData.uf || currentClientData.uf || ''),
    };

    const updatedAddress = payload.address ? {
      cep: payload.address.cep !== undefined ? String(payload.address.cep).trim() : currentAddress.cep,
      logradouro: payload.address.logradouro !== undefined ? String(payload.address.logradouro).trim() : currentAddress.logradouro,
      numero: payload.address.numero !== undefined ? String(payload.address.numero).trim() : currentAddress.numero,
      complemento: payload.address.complemento !== undefined ? String(payload.address.complemento).trim() : currentAddress.complemento,
      bairro: payload.address.bairro !== undefined ? String(payload.address.bairro).trim() : currentAddress.bairro,
      cidade: payload.address.cidade !== undefined ? String(payload.address.cidade).trim() : currentAddress.cidade,
      uf: payload.address.uf !== undefined ? String(payload.address.uf).trim().toUpperCase() : currentAddress.uf,
    } : currentAddress;

    // Lista de campos protegidos do sistema que nunca podem ser sobrescritos pelo cliente via PATCH
    const PROTECTED_CLIENT_DATA_KEYS = [
      'contratoToken',
      'docToken',
      'signUrl',
      'sign_url',
      'contratoGeradoEm',
      'checkoutId',
      'asaasCustomerId',
      'asaasPaymentId',
      'asaasPaymentStatus',
      'asaasSubscriptionId',
      'asaasInvoiceUrl',
      'asaasBankSlipUrl',
      'asaasPixQrCode',
      'asaasPixCopiaECola',
      'status',
      'partnerId',
      'partner_id',
      'clientId',
      'client_id',
    ];

    const sanitizedInputClientData = { ...inputClientData };
    for (const key of PROTECTED_CLIENT_DATA_KEYS) {
      delete sanitizedInputClientData[key];
    }

    // Regra da Opção 1:
    // Status rascunho ou enviada: permite atualizar campos de proposta e recalcular prêmio.
    // Status assinado, pagamento_gerado, aprovada, emitida (e outros status pós-emissão/contrato):
    // Preserva os valores financeiros originais da cotação (importanciaSegurada, premioFinal e plano)
    // para integridade com ZapSign e Asaas, tanto para corretores quanto administradores.
    const isFinancialMutable = ['rascunho', 'enviada'].includes(cotacao.status);

    const proposal = (payload.proposalData || {}) as Record<string, unknown>;

    const rawImportancia = proposal.importanciaSegurada ?? payload.importancia_segurada ?? payload.importanciaSegurada ?? (isFinancialMutable ? sanitizedInputClientData.valorCobertura : undefined);
    let importanciaSegurada: number | null = cotacao.importancia_segurada !== null ? Number(cotacao.importancia_segurada) : null;
    if (isFinancialMutable && rawImportancia !== undefined) {
      const num = typeof rawImportancia === 'number'
        ? rawImportancia
        : Number(String(rawImportancia).replace(/\D/g, '')) / (String(rawImportancia).includes(',') ? 100 : 1);
      if (!isNaN(num) && num > 0) importanciaSegurada = num;
    }

    const rawPlanoNome = proposal.planoNome ?? payload.plano_nome ?? payload.nomePlano ?? sanitizedInputClientData.nomePlano;
    const planoNome = isFinancialMutable && rawPlanoNome !== undefined
      ? String(rawPlanoNome)
      : (currentClientData.nomePlano || currentClientData.tipoDePlano || currentClientData.tipo || 'RC Advogados');

    const rawFranquia = proposal.franquia ?? payload.planoFranquia ?? payload.franquia ?? sanitizedInputClientData.planoFranquia;
    const franquia = rawFranquia !== undefined
      ? String(rawFranquia)
      : (currentClientData.planoFranquia || currentClientData.franquia || 'R$ 1.000,00');

    const rawParcela = proposal.parcela ?? payload.parcela ?? sanitizedInputClientData.parcela;
    const parcela = rawParcela !== undefined
      ? (Number(rawParcela) || 1)
      : (Number(currentClientData.parcela) || 1);

    const rawNotes = proposal.notes ?? payload.notes ?? sanitizedInputClientData.observacoes;
    const notes = rawNotes !== undefined
      ? (rawNotes ? String(rawNotes) : null)
      : cotacao.notes;

    const cupomCodigo = (payload.cupomCodigo ?? sanitizedInputClientData.cupomCodigo ?? currentClientData.cupomCodigo) as string | null | undefined;

    // Prevenção de Price Tampering:
    // O prêmio final é recalculado no servidor a partir da tabela oficial de planos e cupom,
    // nunca aceitando valores enviados arbitrariamente pelo cliente.
    let premioFinal: number | null = cotacao.premio_final !== null ? Number(cotacao.premio_final) : null;
    let valorParcelaCalculada: number | null = null;
    let parcelasCalculadas: number = parcela;

    if (isFinancialMutable) {
      const targetPlano = (sanitizedInputClientData.tipo || sanitizedInputClientData.tipoDePlano || rawPlanoNome || currentClientData.tipoDePlano || currentClientData.tipo || currentClientData.nomePlano) as string | null | undefined;
      const precoCalculado = await calcularPrecoServidor({
        tipoDePlano: targetPlano,
        qtdParcelasSolicitada: parcela,
        cupomCodigo,
      });

      if (precoCalculado) {
        premioFinal = precoCalculado.valorTotal;
        valorParcelaCalculada = precoCalculado.valorParcela;
        parcelasCalculadas = precoCalculado.qtdParcelas;
      } else if (user.role !== 'duolife_admin' && !cotacao.premio_final) {
        return Response.json({ error: 'Não foi possível calcular o preço oficial do plano selecionado' }, { status: 422 });
      }
    }

    // Mesclagem de client_data preservando dados protegidos anteriores (tokens ZapSign, checkoutId, etc.)
    const mergedClientData: Record<string, unknown> = {
      ...currentClientData,
      ...sanitizedInputClientData,
      nome: clientName,
      cpfCnpj: clientCpfCnpj,
      email: clientEmail,
      celular: clientPhone,
      telefone: clientPhone,
      ...(birthDate ? { dataNascto: birthDate } : {}),
      // Endereço
      cep: updatedAddress.cep,
      logradouro: updatedAddress.logradouro,
      rua: updatedAddress.logradouro,
      numero: updatedAddress.numero,
      complemento: updatedAddress.complemento,
      bairro: updatedAddress.bairro,
      cidade: updatedAddress.cidade,
      uf: updatedAddress.uf,
      // Plano e coberturas oficiais recalculados
      nomePlano: planoNome,
      tipoDePlano: planoNome,
      tipo: planoNome,
      planoFranquia: franquia,
      franquia: franquia,
      parcela: parcelasCalculadas,
      ...(premioFinal !== null ? { valor: premioFinal, premioFinal } : {}),
      ...(valorParcelaCalculada !== null ? { valorParcela: valorParcelaCalculada } : {}),
      ...(importanciaSegurada !== null ? { valorCobertura: `R$ ${importanciaSegurada.toLocaleString('pt-BR')}` } : {}),
      // Preserva tokens invioláveis gerados anteriormente no servidor
      ...(currentClientData.contratoToken ? { contratoToken: currentClientData.contratoToken } : {}),
      ...(currentClientData.signUrl ? { signUrl: currentClientData.signUrl } : {}),
      ...(currentClientData.docToken ? { docToken: currentClientData.docToken } : {}),
      ...(currentClientData.checkoutId ? { checkoutId: currentClientData.checkoutId } : {}),
      // Dados profissionais da proposta (sempre permitidos)
      ...(proposal.oab !== undefined || sanitizedInputClientData.oab !== undefined ? { oab: proposal.oab ?? sanitizedInputClientData.oab } : {}),
      ...(proposal.oabUf !== undefined || sanitizedInputClientData.oabUf !== undefined || sanitizedInputClientData.ufOab !== undefined ? {
        oabUf: proposal.oabUf ?? sanitizedInputClientData.oabUf ?? sanitizedInputClientData.ufOab,
        ufOab: proposal.oabUf ?? sanitizedInputClientData.oabUf ?? sanitizedInputClientData.ufOab,
      } : {}),
      ...(proposal.atuacao !== undefined || sanitizedInputClientData.atuacao !== undefined ? { atuacao: proposal.atuacao ?? sanitizedInputClientData.atuacao } : {}),
      ...(proposal.titularidade !== undefined || sanitizedInputClientData.titularidade !== undefined ? { titularidade: proposal.titularidade ?? sanitizedInputClientData.titularidade } : {}),
      ...(proposal.escritorioAssociado !== undefined || sanitizedInputClientData.escritorioAssociado !== undefined ? { escritorioAssociado: proposal.escritorioAssociado ?? sanitizedInputClientData.escritorioAssociado } : {}),
      ...(proposal.faturamentoAntes !== undefined || sanitizedInputClientData.faturamentoAntes !== undefined ? { faturamentoAntes: proposal.faturamentoAntes ?? sanitizedInputClientData.faturamentoAntes } : {}),
      ...(proposal.faturamentoDepois !== undefined || sanitizedInputClientData.faturamentoDepois !== undefined ? { faturamentoDepois: proposal.faturamentoDepois ?? sanitizedInputClientData.faturamentoDepois } : {}),
      ...(proposal.dataInicioVigencia !== undefined || sanitizedInputClientData.dataInicioVigencia !== undefined || sanitizedInputClientData.vigencia !== undefined ? {
        dataInicioVigencia: proposal.dataInicioVigencia ?? sanitizedInputClientData.dataInicioVigencia ?? sanitizedInputClientData.vigencia,
        vigencia: proposal.dataInicioVigencia ?? sanitizedInputClientData.dataInicioVigencia ?? sanitizedInputClientData.vigencia,
        dataVigencia: proposal.dataInicioVigencia ?? sanitizedInputClientData.dataInicioVigencia ?? sanitizedInputClientData.vigencia,
      } : {}),
    };

    // Sincroniza o cliente em insurance_clients
    const insuranceClient = await upsertInsuranceClient({
      documentNumber: clientCpfCnpj,
      fullName: clientName,
      email: clientEmail,
      phone: clientPhone,
      birthDate,
      metadata: {
        address: updatedAddress,
        partnerId: cotacao.partner_id,
      },
    });

    // Atualiza a cotação
    await sql`
      UPDATE cotacoes
      SET
        client_id = ${insuranceClient.id},
        client_name = ${clientName},
        client_cpf_cnpj = ${clientCpfCnpj},
        client_email = ${clientEmail},
        client_phone = ${clientPhone},
        client_data = ${JSON.stringify(mergedClientData)}::jsonb,
        importancia_segurada = ${importanciaSegurada},
        premio_final = ${premioFinal},
        notes = ${notes},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    // Retorna a cotação atualizada completa com joins
    const [updatedQuote] = await sql`
      SELECT
        c.*,
        p.name AS product_name,
        p.flow_key AS product_flow_key,
        part.nome_fantasia AS partner_name,
        part.razao_social AS partner_razao_social
      FROM cotacoes c
      LEFT JOIN products p ON p.id = c.product_id
      LEFT JOIN partners part ON part.id = c.partner_id
      WHERE c.id = ${id}
      LIMIT 1
    `;

    return Response.json({ ok: true, cotacao: updatedQuote });
  } catch (err) {
    const errorDetails = err instanceof Error ? err.message : String(err);
    logger.error({ err, id, details: errorDetails }, 'api.cotacoes.patch.failed');
    return Response.json({
      error: 'Erro interno ao atualizar cotação',
    }, { status: 500 });
  }
}
