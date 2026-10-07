import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { getAccessibleQuoteById } from '@/lib/access';
import { upsertInsuranceClient } from '@/lib/insurance-ops';
import { parseJsonbField } from '@/lib/json-safe';
import { calcularPrecoServidor } from '@/lib/pricing';
import { parseCurrencyToNumber, sanitizePlanFinancials, calculatePolicyExpiryDate } from '@/lib/format';
import { parseAtuacaoList } from '@/lib/atuacao';
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

function pickField<T = unknown>(key: string, ...sources: (Record<string, unknown> | undefined | null)[]): T | undefined {
  for (const src of sources) {
    if (src && src[key] !== undefined && src[key] !== null) {
      return src[key] as T;
    }
  }
  return undefined;
}

function normalizeSimNao(val: unknown): 'Sim' | 'Não' | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'number') return val === 1 ? 'Sim' : 'Não';
  const s = String(val).trim().toLowerCase();
  if (['sim', 's', 'true', '1'].includes(s)) return 'Sim';
  if (['nao', 'não', 'n', 'false', '0'].includes(s)) return 'Não';
  return undefined;
}

function cleanString(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  return s.length > 0 ? s : undefined;
}

function cleanUf(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim().toUpperCase();
  return s ? s.slice(0, 2) : undefined;
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

    // Status rascunho, enviada ou contrato_gerado (aguardando assinatura):
    // Permite atualizar campos de proposta e recalcular prêmio. Caso a cotação já possua
    // minuta gerada, a alteração marcará a minuta como desatualizada para que o operador possa regerá-la na ZapSign.
    // Status assinado, pagamento_gerado, aprovada, emitida:
    // Preserva os valores financeiros originais da cotação para integridade com os títulos já assinados/gerados.
    const isFinancialMutable = ['rascunho', 'enviada', 'contrato_gerado'].includes(cotacao.status);

    const proposal = (payload.proposalData || {}) as Record<string, unknown>;

    const rawImportancia = proposal.importanciaSegurada ?? payload.importancia_segurada ?? payload.importanciaSegurada ?? (isFinancialMutable ? sanitizedInputClientData.valorCobertura : undefined);
    let importanciaSegurada: number | null = cotacao.importancia_segurada !== null ? Number(cotacao.importancia_segurada) : null;
    if (isFinancialMutable && rawImportancia !== undefined) {
      const num = parseCurrencyToNumber(rawImportancia, 0);
      if (num > 0) importanciaSegurada = num;
    }

    const rawPlanoNome = proposal.planoNome ?? payload.plano_nome ?? payload.nomePlano ?? sanitizedInputClientData.nomePlano;
    const planoNome: string = isFinancialMutable && rawPlanoNome !== undefined
      ? String(rawPlanoNome)
      : String(currentClientData.nomePlano || currentClientData.tipoDePlano || currentClientData.tipo || 'RC Advogados');

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

    // Extração de prêmio manual enviado via formulário/modal de edição (permitido para cotações em rascunho/enviada)
    const rawPremio = proposal.premioFinal ?? payload.premio_final ?? payload.premioFinal ?? (isFinancialMutable ? (sanitizedInputClientData.valor ?? sanitizedInputClientData.premioFinal) : undefined);
    let userSpecifiedPremio: number | null = null;
    if (isFinancialMutable && rawPremio !== undefined && rawPremio !== null && rawPremio !== '') {
      const parsed = parseCurrencyToNumber(rawPremio, 0);
      if (parsed > 0) {
        userSpecifiedPremio = parsed;
      }
    }

    let premioFinal: number | null = cotacao.premio_final !== null ? Number(cotacao.premio_final) : null;
    let valorParcelaCalculada: number | null = null;
    let parcelasCalculadas: number = parcela;

    if (isFinancialMutable) {
      if (userSpecifiedPremio !== null && userSpecifiedPremio > 0) {
        // Usuário/operador editou explicitamente o valor do prêmio
        premioFinal = userSpecifiedPremio;
        parcelasCalculadas = parcela;
        valorParcelaCalculada = parcelasCalculadas > 0
          ? Math.round((premioFinal / parcelasCalculadas) * 100) / 100
          : premioFinal;
      } else {
        const targetPlano = (sanitizedInputClientData.tipo || sanitizedInputClientData.tipoDePlano || rawPlanoNome || currentClientData.tipoDePlano || currentClientData.tipo || currentClientData.nomePlano) as string | null | undefined;
        const precoCalculado = await calcularPrecoServidor({
          tipoDePlano: targetPlano,
          qtdParcelasSolicitada: parcela,
          cupomCodigo,
          descontoManualPercent: Number(
            payload.descontoManualPercent ??
            sanitizedInputClientData.descontoManualPercent ??
            sanitizedInputClientData.descontoPercentual ??
            currentClientData.descontoManualPercent ??
            currentClientData.descontoPercentual
          ) || 0,
        });

        if (precoCalculado) {
          premioFinal = precoCalculado.valorTotal;
          valorParcelaCalculada = precoCalculado.valorParcela;
          parcelasCalculadas = precoCalculado.qtdParcelas;
        } else if (user.role !== 'duolife_admin' && !cotacao.premio_final) {
          return Response.json({ error: 'Não foi possível calcular o preço oficial do plano selecionado' }, { status: 422 });
        }
      }
    }

    // Auto-cura de valores inflados (* 100) decorrentes de bugs legados
    const sanitizedFinancials = sanitizePlanFinancials({
      planoNome,
      cobertura: importanciaSegurada,
      premio: premioFinal,
    });
    if (sanitizedFinancials.cobertura > 0) {
      importanciaSegurada = sanitizedFinancials.cobertura;
    }
    if (sanitizedFinancials.premio > 0 && (isFinancialMutable || (premioFinal !== null && premioFinal >= 10000))) {
      premioFinal = sanitizedFinancials.premio;
      if (parcelasCalculadas > 0 && premioFinal !== null) {
        valorParcelaCalculada = Math.round((premioFinal / parcelasCalculadas) * 100) / 100;
      }
    }

    // Fontes para dados da proposta, escritório, underwriting e conselhos de classe
    const rawProposalSources = [proposal, sanitizedInputClientData, payload as Record<string, unknown>];

    // --- 1. ESCRITÓRIO ---
    const rawAssociado = pickField('associadoEscritorio', ...rawProposalSources);
    const rawNomeEscritorio = pickField('nomeEscritorio', ...rawProposalSources);
    const rawEscritorioAssociado = pickField('escritorioAssociado', ...rawProposalSources);
    const rawEscritorio = pickField('escritorio', ...rawProposalSources);

    let associadoEscritorio: string | undefined;
    if (rawAssociado !== undefined) {
      associadoEscritorio = normalizeSimNao(rawAssociado);
    } else if (rawEscritorioAssociado !== undefined) {
      const s = String(rawEscritorioAssociado).trim().toLowerCase();
      associadoEscritorio = (s === 'não associado' || s === 'nao associado' || s === 'não' || s === 'nao') ? 'Não' : 'Sim';
    } else if (rawNomeEscritorio !== undefined && String(rawNomeEscritorio).trim().length > 0) {
      associadoEscritorio = 'Sim';
    } else if (currentClientData.associadoEscritorio !== undefined) {
      associadoEscritorio = normalizeSimNao(currentClientData.associadoEscritorio) ?? String(currentClientData.associadoEscritorio);
    }

    const nomeEscritorio = cleanString(rawNomeEscritorio) ??
      cleanString(rawEscritorio && rawEscritorio !== 'Não associado' ? rawEscritorio : undefined) ??
      cleanString(currentClientData.nomeEscritorio);

    let escritorioAssociado: string | undefined;
    if (associadoEscritorio === 'Sim') {
      escritorioAssociado = nomeEscritorio || cleanString(rawEscritorioAssociado) || cleanString(rawEscritorio) || 'Sim (Associado a escritório)';
    } else if (associadoEscritorio === 'Não') {
      escritorioAssociado = 'Não associado';
    } else {
      escritorioAssociado = cleanString(rawEscritorioAssociado) ?? cleanString(currentClientData.escritorioAssociado);
    }

    const escritorio = cleanString(rawEscritorio) ??
      (associadoEscritorio === 'Não' ? 'Não associado' : (nomeEscritorio || escritorioAssociado || cleanString(currentClientData.escritorio)));

    const titularidade = cleanString(pickField('titularidade', ...rawProposalSources)) ?? cleanString(currentClientData.titularidade);
    const titularidadeTipo = cleanString(pickField('titularidadeTipo', ...rawProposalSources)) ?? cleanString(currentClientData.titularidadeTipo);
    const titularidadeOutro = cleanString(pickField('titularidadeOutro', ...rawProposalSources)) ?? cleanString(currentClientData.titularidadeOutro);
    const faturamentoAntes = cleanString(pickField('faturamentoAntes', ...rawProposalSources)) ?? cleanString(currentClientData.faturamentoAntes);
    const faturamentoDepois = cleanString(pickField('faturamentoDepois', ...rawProposalSources)) ?? cleanString(currentClientData.faturamentoDepois);

    // --- 2. ÁREAS DE ATUAÇÃO ---
    const rawEspecialidades = pickField('especialidades', ...rawProposalSources);
    const rawAtuacao = pickField('atuacao', ...rawProposalSources);

    let especialidades: string[] | undefined;
    let atuacao: string[] | string | undefined;

    if (rawEspecialidades !== undefined || rawAtuacao !== undefined) {
      const sourceForList = rawEspecialidades !== undefined ? rawEspecialidades : rawAtuacao;
      const parsedList = parseAtuacaoList(sourceForList);
      especialidades = parsedList;

      if (rawAtuacao !== undefined) {
        if (Array.isArray(rawAtuacao)) {
          atuacao = parseAtuacaoList(rawAtuacao);
        } else if (typeof rawAtuacao === 'string') {
          atuacao = rawAtuacao.trim();
        } else {
          atuacao = parsedList;
        }
      } else {
        atuacao = parsedList;
      }
    } else {
      if (currentClientData.especialidades !== undefined) {
        especialidades = parseAtuacaoList(currentClientData.especialidades);
      } else if (currentClientData.atuacao !== undefined) {
        especialidades = parseAtuacaoList(currentClientData.atuacao);
      }
      if (currentClientData.atuacao !== undefined) {
        atuacao = currentClientData.atuacao as string[] | string;
      }
    }

    // --- 3. QUESTIONÁRIO DE RISCO (UNDERWRITING) ---
    const rawPropostaRecusada = pickField('propostaRecusada', ...rawProposalSources);
    const propostaRecusada = rawPropostaRecusada !== undefined
      ? (normalizeSimNao(rawPropostaRecusada) ?? String(rawPropostaRecusada))
      : (normalizeSimNao(currentClientData.propostaRecusada) ?? cleanString(currentClientData.propostaRecusada));
    const propostaDetalhe = cleanString(pickField('propostaDetalhe', ...rawProposalSources)) ??
      cleanString(currentClientData.propostaDetalhe);

    const rawReclamacao = pickField('reclamacaoProfissional', ...rawProposalSources);
    const reclamacaoProfissional = rawReclamacao !== undefined
      ? (normalizeSimNao(rawReclamacao) ?? String(rawReclamacao))
      : (normalizeSimNao(currentClientData.reclamacaoProfissional) ?? cleanString(currentClientData.reclamacaoProfissional));
    const reclamacaoDetalhe = cleanString(pickField('reclamacaoDetalhe', ...rawProposalSources)) ??
      cleanString(currentClientData.reclamacaoDetalhe);

    const rawInvestigacao = pickField('investigacaoAutoridade', ...rawProposalSources);
    const investigacaoAutoridade = rawInvestigacao !== undefined
      ? (normalizeSimNao(rawInvestigacao) ?? String(rawInvestigacao))
      : (normalizeSimNao(currentClientData.investigacaoAutoridade) ?? cleanString(currentClientData.investigacaoAutoridade));
    const investigacaoDetalhe = cleanString(pickField('investigacaoDetalhe', ...rawProposalSources)) ??
      cleanString(currentClientData.investigacaoDetalhe);

    const rawFatoTerceiros = pickField('fatoTerceiros', ...rawProposalSources);
    const fatoTerceiros = rawFatoTerceiros !== undefined
      ? (normalizeSimNao(rawFatoTerceiros) ?? String(rawFatoTerceiros))
      : (normalizeSimNao(currentClientData.fatoTerceiros) ?? cleanString(currentClientData.fatoTerceiros));
    const fatoDetalhe = cleanString(pickField('fatoDetalhe', ...rawProposalSources)) ??
      cleanString(currentClientData.fatoDetalhe);

    const rawPagouReclamacao = pickField('pagouReclamacao', ...rawProposalSources);
    const pagouReclamacao = rawPagouReclamacao !== undefined
      ? (normalizeSimNao(rawPagouReclamacao) ?? String(rawPagouReclamacao))
      : (normalizeSimNao(currentClientData.pagouReclamacao) ?? cleanString(currentClientData.pagouReclamacao));
    const pagouDetalhe = cleanString(pickField('pagouDetalhe', ...rawProposalSources)) ??
      cleanString(currentClientData.pagouDetalhe);

    // --- 4. SEGURO ANTERIOR (RENOVAÇÃO) ---
    const rawRenovacao = pickField('isRenovacao', ...rawProposalSources) ??
      pickField('renovacao', ...rawProposalSources);

    let isRenovacao: string | undefined;
    let renovacao: boolean | undefined;

    if (rawRenovacao !== undefined) {
      if (typeof rawRenovacao === 'boolean') {
        renovacao = rawRenovacao;
        isRenovacao = rawRenovacao ? 'Sim' : 'Não';
      } else {
        const norm = normalizeSimNao(rawRenovacao);
        if (norm) {
          isRenovacao = norm;
          renovacao = norm === 'Sim';
        } else {
          isRenovacao = String(rawRenovacao);
          renovacao = rawRenovacao === 'true' || rawRenovacao === 'Sim';
        }
      }
    } else {
      if (currentClientData.isRenovacao !== undefined) {
        isRenovacao = String(currentClientData.isRenovacao);
      }
      if (currentClientData.renovacao !== undefined) {
        renovacao = Boolean(currentClientData.renovacao);
      } else if (isRenovacao !== undefined) {
        renovacao = isRenovacao === 'Sim';
      }
    }

    const seguradora = cleanString(pickField('seguradora', ...rawProposalSources)) ?? cleanString(currentClientData.seguradora);
    const limite = cleanString(pickField('limite', ...rawProposalSources)) ??
      cleanString(pickField('lmiAnterior', ...rawProposalSources)) ??
      cleanString(currentClientData.limite) ??
      cleanString(currentClientData.lmiAnterior);
    const franquiaAnterior = cleanString(pickField('franquiaAnterior', ...rawProposalSources)) ?? cleanString(currentClientData.franquiaAnterior);
    const dataRetroativa = cleanString(pickField('dataRetroativa', ...rawProposalSources)) ??
      cleanString(pickField('retroatividade', ...rawProposalSources)) ??
      cleanString(currentClientData.dataRetroativa) ??
      cleanString(currentClientData.retroatividade);

    // --- 5. PESSOAS POLITICAMENTE EXPOSTAS (PPE) ---
    const rawPpeCargos = pickField('ppeCargos', ...rawProposalSources);
    let ppeCargos: string | boolean | undefined;
    if (rawPpeCargos !== undefined) {
      if (typeof rawPpeCargos === 'boolean') {
        ppeCargos = rawPpeCargos;
      } else {
        ppeCargos = normalizeSimNao(rawPpeCargos) ?? String(rawPpeCargos);
      }
    } else if (currentClientData.ppeCargos !== undefined) {
      ppeCargos = currentClientData.ppeCargos as string | boolean;
    }

    const rawPpeRepresenta = pickField('ppeRepresenta', ...rawProposalSources);
    let ppeRepresenta: string | boolean | undefined;
    if (rawPpeRepresenta !== undefined) {
      if (typeof rawPpeRepresenta === 'boolean') {
        ppeRepresenta = rawPpeRepresenta;
      } else {
        ppeRepresenta = normalizeSimNao(rawPpeRepresenta) ?? String(rawPpeRepresenta);
      }
    } else if (currentClientData.ppeRepresenta !== undefined) {
      ppeRepresenta = currentClientData.ppeRepresenta as string | boolean;
    }

    const rawPpeCargoSelect = pickField('ppeCargoSelect', ...rawProposalSources);
    let ppeCargoSelect: string | undefined;
    if (rawPpeCargoSelect !== undefined) {
      if (Array.isArray(rawPpeCargoSelect)) {
        ppeCargoSelect = rawPpeCargoSelect.map(String).join(', ');
      } else {
        ppeCargoSelect = cleanString(rawPpeCargoSelect);
      }
    } else if (currentClientData.ppeCargoSelect !== undefined) {
      ppeCargoSelect = Array.isArray(currentClientData.ppeCargoSelect)
        ? (currentClientData.ppeCargoSelect as unknown[]).map(String).join(', ')
        : cleanString(currentClientData.ppeCargoSelect);
    }

    // --- 6. REGISTROS DE CLASSE ADICIONAIS ---
    const oab = cleanString(pickField('oab', ...rawProposalSources)) ?? cleanString(currentClientData.oab);
    const oabUf = cleanUf(pickField('oabUf', ...rawProposalSources) ?? pickField('ufOab', ...rawProposalSources)) ??
      cleanUf(currentClientData.oabUf ?? currentClientData.ufOab);

    const crm = cleanString(pickField('crm', ...rawProposalSources)) ?? cleanString(currentClientData.crm);
    const crmUf = cleanUf(pickField('crmUf', ...rawProposalSources) ?? pickField('ufCrm', ...rawProposalSources)) ??
      cleanUf(currentClientData.crmUf ?? currentClientData.ufCrm);

    const rqe = cleanString(pickField('rqe', ...rawProposalSources)) ?? cleanString(currentClientData.rqe);

    const cro = cleanString(pickField('cro', ...rawProposalSources)) ?? cleanString(currentClientData.cro);
    const croUf = cleanUf(pickField('croUf', ...rawProposalSources) ?? pickField('ufCro', ...rawProposalSources)) ??
      cleanUf(currentClientData.croUf ?? currentClientData.ufCro);

    const creaCau = cleanString(pickField('creaCau', ...rawProposalSources)) ?? cleanString(currentClientData.creaCau);
    const creaCauUf = cleanUf(pickField('creaCauUf', ...rawProposalSources) ?? pickField('ufCreaCau', ...rawProposalSources)) ??
      cleanUf(currentClientData.creaCauUf ?? currentClientData.ufCreaCau);

    const crc = cleanString(pickField('crc', ...rawProposalSources)) ?? cleanString(currentClientData.crc);
    const crcUf = cleanUf(pickField('crcUf', ...rawProposalSources) ?? pickField('ufCrc', ...rawProposalSources)) ??
      cleanUf(currentClientData.crcUf ?? currentClientData.ufCrc);

    // --- 7. VIGÊNCIA DA PROPOSTA ---
    const rawDataInicioVigencia = pickField('dataInicioVigencia', ...rawProposalSources) ??
      pickField('vigencia', ...rawProposalSources) ??
      pickField('dataVigencia', ...rawProposalSources);
    const dataInicioVigencia = cleanString(rawDataInicioVigencia) ??
      cleanString(currentClientData.dataInicioVigencia) ??
      cleanString(currentClientData.vigencia) ??
      cleanString(currentClientData.dataVigencia);

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
      ...(payload.descontoManualPercent !== undefined || sanitizedInputClientData.descontoManualPercent !== undefined || payload.descontoPercentual !== undefined || sanitizedInputClientData.descontoPercentual !== undefined ? {
        descontoManualPercent: Math.min(40, Math.max(0, Number(payload.descontoManualPercent ?? sanitizedInputClientData.descontoManualPercent ?? payload.descontoPercentual ?? sanitizedInputClientData.descontoPercentual) || 0)),
        descontoPercentual: Math.min(40, Math.max(0, Number(payload.descontoPercentual ?? sanitizedInputClientData.descontoPercentual ?? payload.descontoManualPercent ?? sanitizedInputClientData.descontoManualPercent) || 0)),
      } : {}),
      ...(payload.valorOriginal !== undefined || sanitizedInputClientData.valorOriginal !== undefined ? {
        valorOriginal: Number(payload.valorOriginal ?? sanitizedInputClientData.valorOriginal) || 0,
      } : {}),
      // Preserva tokens invioláveis gerados anteriormente no servidor
      ...(currentClientData.contratoToken ? { contratoToken: currentClientData.contratoToken } : {}),
      ...(currentClientData.signUrl ? { signUrl: currentClientData.signUrl } : {}),
      ...(currentClientData.docToken ? { docToken: currentClientData.docToken } : {}),
      ...(currentClientData.checkoutId ? { checkoutId: currentClientData.checkoutId } : {}),

      // Vigência da Proposta
      ...(dataInicioVigencia !== undefined ? {
        dataInicioVigencia,
        fimVigencia: calculatePolicyExpiryDate(dataInicioVigencia),
        vigencia: dataInicioVigencia,
        dataVigencia: dataInicioVigencia,
      } : {}),

      // 1. Escritório
      ...(associadoEscritorio !== undefined ? { associadoEscritorio } : {}),
      ...(nomeEscritorio !== undefined ? { nomeEscritorio } : {}),
      ...(escritorioAssociado !== undefined ? { escritorioAssociado } : {}),
      ...(escritorio !== undefined ? { escritorio } : {}),
      ...(titularidade !== undefined ? { titularidade } : {}),
      ...(titularidadeTipo !== undefined ? { titularidadeTipo } : {}),
      ...(titularidadeOutro !== undefined ? { titularidadeOutro } : {}),
      ...(faturamentoAntes !== undefined ? { faturamentoAntes } : {}),
      ...(faturamentoDepois !== undefined ? { faturamentoDepois } : {}),

      // 2. Áreas de Atuação
      ...(especialidades !== undefined ? { especialidades } : {}),
      ...(atuacao !== undefined ? { atuacao } : {}),

      // 3. Questionário de Risco (Underwriting)
      ...(propostaRecusada !== undefined ? { propostaRecusada } : {}),
      ...(propostaDetalhe !== undefined ? { propostaDetalhe } : {}),
      ...(reclamacaoProfissional !== undefined ? { reclamacaoProfissional } : {}),
      ...(reclamacaoDetalhe !== undefined ? { reclamacaoDetalhe } : {}),
      ...(investigacaoAutoridade !== undefined ? { investigacaoAutoridade } : {}),
      ...(investigacaoDetalhe !== undefined ? { investigacaoDetalhe } : {}),
      ...(fatoTerceiros !== undefined ? { fatoTerceiros } : {}),
      ...(fatoDetalhe !== undefined ? { fatoDetalhe } : {}),
      ...(pagouReclamacao !== undefined ? { pagouReclamacao } : {}),
      ...(pagouDetalhe !== undefined ? { pagouDetalhe } : {}),

      // 4. Seguro Anterior (Renovação)
      ...(isRenovacao !== undefined ? { isRenovacao } : {}),
      ...(renovacao !== undefined ? { renovacao } : {}),
      ...(seguradora !== undefined ? { seguradora } : {}),
      ...(limite !== undefined ? { limite } : {}),
      ...(franquiaAnterior !== undefined ? { franquiaAnterior } : {}),
      ...(dataRetroativa !== undefined ? { dataRetroativa } : {}),

      // 5. Pessoas Politicamente Expostas (PPE)
      ...(ppeCargos !== undefined ? { ppeCargos } : {}),
      ...(ppeRepresenta !== undefined ? { ppeRepresenta } : {}),
      ...(ppeCargoSelect !== undefined ? { ppeCargoSelect } : {}),

      // 6. Registros de Classe Adicionais
      ...(oab !== undefined ? { oab } : {}),
      ...(oabUf !== undefined ? { oabUf, ufOab: oabUf } : {}),
      ...(crm !== undefined ? { crm } : {}),
      ...(crmUf !== undefined ? { crmUf, ufCrm: crmUf } : {}),
      ...(rqe !== undefined ? { rqe } : {}),
      ...(cro !== undefined ? { cro } : {}),
      ...(croUf !== undefined ? { croUf, ufCro: croUf } : {}),
      ...(creaCau !== undefined ? { creaCau } : {}),
      ...(creaCauUf !== undefined ? { creaCauUf, ufCreaCau: creaCauUf } : {}),
      ...(crc !== undefined ? { crc } : {}),
      ...(crcUf !== undefined ? { crcUf, ufCrc: crcUf } : {}),
    };

    // Se a cotação já possuir contrato gerado na ZapSign (status contrato_gerado ou token ativo),
    // qualquer alteração realizada no cliente ou na proposta marca a minuta como desatualizada,
    // habilitando o botão "Regerar Minuta" para o operador cancelar a anterior e emitir a nova.
    const hasContractGenerated = cotacao.status === 'contrato_gerado' || Boolean(currentClientData.contratoToken);
    if (hasContractGenerated) {
      mergedClientData.minutaDesatualizada = true;
      mergedClientData.minutaAlteradaEm = new Date().toISOString();
      mergedClientData.minutaDesatualizadaMotivo = 'Informações da proposta, escritório ou declarações de risco foram alteradas';
    }

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

    const isRenewalDb = isRenovacao !== undefined
      ? (isRenovacao === 'Sim' || renovacao === true)
      : (Boolean(cotacao.is_renewal) || currentClientData.isRenovacao === 'Sim' || currentClientData.renovacao === true);

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
        is_renewal = ${isRenewalDb},
        notes = ${notes},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    // Se existir ordem de pagamento pendente/não paga para esta cotação em edição, sincroniza o valor total
    if (isFinancialMutable && premioFinal !== null) {
      await sql`
        UPDATE payment_orders
        SET
          amount_total = ${premioFinal},
          installment_count = ${parcelasCalculadas},
          updated_at = NOW()
        WHERE cotacao_id = ${id}
          AND status NOT IN ('paid', 'received', 'confirmed', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
      `;
    }

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
