'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  X,
  FileText,
  User,
  Shield,
  ShieldAlert,
  Lock,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
  Save,
  Tag,
  Percent,
  TrendingDown,
  Layers,
  Sparkles,
  CreditCard,
  Briefcase,
  ClipboardCheck,
  Building2,
  Award,
  AlertTriangle,
  History,
  FileSignature,
  Check,
} from 'lucide-react';
import {
  BRAZILIAN_UFS,
  maskCpfCnpj,
  maskPhone,
  maskCep,
  formatDateToInput,
  cleanDigits,
  formatCurrencyBRL,
  parseCurrencyToNumber,
} from './masks';
import { formatAtuacao, parseAtuacaoList, sanitizePlanFinancials, calculatePolicyExpiryDate, formatDate } from '@/lib/format';
import {
  getRamoConfig,
  rcAdvogadosConfig,
  CARGOS_PPE_PADRAO,
  type RamoConfig,
} from '@/lib/product-schemas';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export interface EditarPropostaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  cotacao: {
    id: string;
    status: string;
    client_name: string;
    client_cpf_cnpj: string;
    client_email?: string | null;
    client_phone?: string | null;
    importancia_segurada?: number | string | null;
    premio_final?: number | string | null;
    notes?: string | null;
    client_data?: any;
    product_id?: string | null;
    product_flow_key?: string | null;
    partner_id?: string | null;
  };
  readOnlyFinancials?: boolean; // Se true ou se status for assinado/pagamento_gerado/aprovada, bloqueia edição de prêmio/cobertura
  initialTab?: 'cliente' | 'proposta' | 'escritorio' | 'risco';
}

export interface PlanoDisponivel {
  tipoDePlano: string;
  nomeExibido: string;
  cobertura: string;
  franquia: string;
  parcela: string;
  ordem?: number;
  parcela2X?: string;
  parcela3X?: string;
  parcela4X?: string;
  parcela5X?: string;
  parcela6X?: string;
  maxParcelas?: number;
}

const FALLBACK_PLANOS: PlanoDisponivel[] = (rcAdvogadosConfig.planos || []).map((p) => ({
  tipoDePlano: p.tipoDePlano,
  nomeExibido: p.nomeExibido,
  cobertura: p.cobertura,
  franquia: p.franquia,
  ordem: p.ordem,
  parcela: p.parcela,
  parcela2X: (p as any).parcela2X,
  parcela3X: (p as any).parcela3X,
  parcela4X: (p as any).parcela4X,
  parcela5X: (p as any).parcela5X,
  parcela6X: (p as any).parcela6X,
  maxParcelas: p.maxParcelas || (p.tipoDePlano === '100k' ? 1 : 6),
}));

export function findMatchingPlano(
  planos: PlanoDisponivel[],
  cdTipo?: string | null,
  cdNomePlano?: string | null,
  coberturaNum?: number | null
): PlanoDisponivel | null {
  if (!planos || planos.length === 0) return null;

  const tLower = String(cdTipo || '').toLowerCase().trim();
  const nLower = String(cdNomePlano || '').toLowerCase().trim();

  // 1. Match direto por tipoDePlano (ex: '100k', '200k', '300k', '500k', '1m', '2m')
  const byTipo = planos.find((p) => p.tipoDePlano.toLowerCase() === tLower);
  if (byTipo) return byTipo;

  // 2. Match por nomeExibido exato
  const byNome = planos.find((p) => p.nomeExibido.toLowerCase() === nLower);
  if (byNome) return byNome;

  // 3. Match se o nome ou tipo contiver a chave do plano (ex: '100k' em 'Plano 100k' ou '100 mil')
  const bySubTipo = planos.find((p) => {
    const key = p.tipoDePlano.toLowerCase();
    const nomeKey = p.nomeExibido.toLowerCase();
    return (
      (tLower && (tLower.includes(key) || tLower.includes(nomeKey))) ||
      (nLower && (nLower.includes(key) || nLower.includes(nomeKey)))
    );
  });
  if (bySubTipo) return bySubTipo;

  // 4. Match por cobertura / importância segurada
  if (coberturaNum && coberturaNum > 0) {
    const byCob = planos.find((p) => {
      const cob = parseCurrencyToNumber(p.cobertura);
      return cob > 0 && Math.abs(cob - coberturaNum) < 1;
    });
    if (byCob) return byCob;
  }

  return null;
}

function parseRawClientData(data: unknown): Record<string, any> {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  if (typeof data === 'object' && data !== null) {
    return { ...(data as Record<string, any>) };
  }
  return {};
}

function formatMoneyInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  const digits = cleanDigits(str);
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const AREAS_ATUACAO_SUGESTOES = [
  'Civil',
  'Trabalhista',
  'Tributário',
  'Previdenciário',
  'Criminal / Penal',
  'Família e Sucessões',
  'Empresarial / Societário',
  'Bancário / Financeiro',
  'Direito Imobiliário',
  'Direito Digital / LGPD',
  'Geral / Múltiplas Áreas',
];

export default function EditarPropostaModal({
  isOpen,
  onClose,
  onSuccess,
  cotacao,
  readOnlyFinancials,
  initialTab,
}: EditarPropostaModalProps) {
  const router = useRouter();
  const numeroInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(isOpen);

  // Aba ativa: 'cliente' | 'proposta' | 'escritorio' | 'risco'
  const [activeTab, setActiveTab] = useState<'cliente' | 'proposta' | 'escritorio' | 'risco'>(initialTab || 'cliente');

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Aba 1: Dados do Cliente & Endereço
  const [clientName, setClientName] = useState('');
  const [clientCpfCnpj, setClientCpfCnpj] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  // Aba 2: Dados da Proposta & Seguro
  const [dataInicioVigencia, setDataInicioVigencia] = useState('');
  const [nomePlano, setNomePlano] = useState('');
  const [importanciaSegurada, setImportanciaSegurada] = useState<string>('');
  const [premioFinal, setPremioFinal] = useState<string>('');
  const [planoFranquia, setPlanoFranquia] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const [notes, setNotes] = useState('');

  // Estados de Planos & Serviço Dinâmico
  const [planosDisponiveis, setPlanosDisponiveis] = useState<PlanoDisponivel[]>(FALLBACK_PLANOS);
  const [loadingPlanos, setLoadingPlanos] = useState<boolean>(false);
  const [selectedPlanoTipo, setSelectedPlanoTipo] = useState<string>('custom');

  // Valores Financeiros & Desconto Comercial (0% a 40%)
  const [premioBase, setPremioBase] = useState<number>(0);
  const [premioBaseInput, setPremioBaseInput] = useState<string>('');
  const [isEditingPremioBase, setIsEditingPremioBase] = useState<boolean>(false);
  const [descontoPercent, setDescontoPercent] = useState<number>(0);
  const [maxParcelasPermitidas, setMaxParcelasPermitidas] = useState<number>(6);

  // Aba 3: Escritório & Atuação
  const [registroProfissionalNumero, setRegistroProfissionalNumero] = useState('');
  const [registroProfissionalUf, setRegistroProfissionalUf] = useState('');
  const [rqe, setRqe] = useState('');
  const [associadoEscritorio, setAssociadoEscritorio] = useState<'Sim' | 'Não'>('Não');
  const [nomeEscritorio, setNomeEscritorio] = useState('');
  const [titularidadeTipo, setTitularidadeTipo] = useState('Graduação');
  const [titularidadeOutro, setTitularidadeOutro] = useState('');
  const [faturamentoAntes, setFaturamentoAntes] = useState('');
  const [faturamentoDepois, setFaturamentoDepois] = useState('');
  const [especialidades, setEspecialidades] = useState<string[]>([]);
  const [atuacao, setAtuacao] = useState('');

  // Aba 4: Histórico de Risco & Declarações
  const [riskAnswers, setRiskAnswers] = useState<Record<string, 'Sim' | 'Não'>>({
    propostaRecusada: 'Não',
    reclamacaoProfissional: 'Não',
    investigacaoAutoridade: 'Não',
    fatoTerceiros: 'Não',
    pagouReclamacao: 'Não',
  });
  const [riskDetails, setRiskDetails] = useState<Record<string, string>>({
    propostaDetalhe: '',
    reclamacaoDetalhe: '',
    investigacaoDetalhe: '',
    fatoDetalhe: '',
    pagouDetalhe: '',
  });

  // Seguro Anterior / Renovação
  const [isRenovacao, setIsRenovacao] = useState<'Sim' | 'Não'>('Não');
  const [seguradoraAnterior, setSeguradoraAnterior] = useState('');
  const [vigenciaAnterior, setVigenciaAnterior] = useState('');
  const [limiteAnterior, setLimiteAnterior] = useState('');
  const [franquiaAnterior, setFranquiaAnterior] = useState('');
  const [dataRetroativa, setDataRetroativa] = useState('');

  // Pessoa Politicamente Exposta (PPE)
  const [ppeCargos, setPpeCargos] = useState<'Sim' | 'Não'>('Não');
  const [ppeRepresenta, setPpeRepresenta] = useState<'Sim' | 'Não'>('Não');
  const [ppeCargoSelect, setPpeCargoSelect] = useState<string[]>([]);

  // Controles de feedback e busca
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepSuccess, setCepSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regerandoMinuta, setRegerandoMinuta] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Regra de bloqueio financeiro estrita
  const isFinancialLocked = Boolean(
    readOnlyFinancials ||
      ['assinado', 'pagamento_gerado', 'aprovada', 'emitida'].includes(
        String(cotacao?.status || '').toLowerCase()
      )
  );

  // Identificação do Ramo de Atuação
  const rawClientData = useMemo(() => parseRawClientData(cotacao?.client_data), [cotacao?.client_data]);

  const resolvedRamoConfig: RamoConfig = useMemo(() => {
    const config = getRamoConfig(
      cotacao?.product_flow_key ||
      cotacao?.product_id ||
      rawClientData?.ramoId ||
      rawClientData?.flowKey ||
      rawClientData?.flow_key
    );
    return config || rcAdvogadosConfig;
  }, [cotacao?.product_flow_key, cotacao?.product_id, rawClientData]);

  // Registro de classe configurado do ramo
  const regConfig = useMemo(() => {
    return (
      resolvedRamoConfig.registroProfissional || {
        key: 'oab',
        label: 'Inscrição OAB',
        placeholder: 'Número da OAB + UF (Ex: 123456/SP)',
        ufKey: 'oabUf',
        required: true,
        hasRqe: false,
      }
    );
  }, [resolvedRamoConfig]);

  // Verifica se a proposta já possui minuta/contrato gerado no ZapSign
  const hasContratoGerado = useMemo(() => {
    return (
      cotacao?.status === 'contrato_gerado' ||
      Boolean(rawClientData?.contratoToken) ||
      Boolean(rawClientData?.docToken)
    );
  }, [cotacao?.status, rawClientData]);

  // Carrega planos dinamicamente via API /api/portal/planos com base no produto/ramo
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    async function carregarPlanos() {
      setLoadingPlanos(true);
      try {
        const queryParams = new URLSearchParams();
        if (cotacao.product_id) queryParams.set('productId', cotacao.product_id);
        if (cotacao.product_flow_key) queryParams.set('flowKey', cotacao.product_flow_key);
        if (cotacao.partner_id) queryParams.set('partnerId', cotacao.partner_id);

        const res = await fetch(`/api/portal/planos?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.planos) && data.planos.length > 0 && !isCancelled) {
            setPlanosDisponiveis(data.planos);
          }
        }
      } catch {
        // Fallback garantido por FALLBACK_PLANOS
      } finally {
        if (!isCancelled) setLoadingPlanos(false);
      }
    }

    carregarPlanos();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, cotacao.product_id, cotacao.product_flow_key, cotacao.partner_id]);

  // Carrega e preenche todos os estados a partir da cotação
  useEffect(() => {
    if (isOpen && cotacao) {
      const cd = parseRawClientData(cotacao.client_data);

      // Aba 1: Cliente
      setClientName(cotacao.client_name || '');
      setClientCpfCnpj(maskCpfCnpj(cotacao.client_cpf_cnpj || ''));
      setClientEmail(cotacao.client_email || cd.email || '');
      setClientPhone(maskPhone(cotacao.client_phone || cd.celular || ''));
      setBirthDate(formatDateToInput(cd.dataNascto || cd.birth_date || ''));

      setCep(maskCep(cd.cep || ''));
      setLogradouro(cd.logradouro || '');
      setNumero(cd.numero || '');
      setComplemento(cd.complemento || '');
      setBairro(cd.bairro || '');
      setCidade(cd.cidade || '');
      setUf(cd.uf ? cd.uf.toUpperCase() : '');

      // Aba 2: Proposta & Seguro
      setDataInicioVigencia(
        formatDateToInput(cd.dataInicioVigencia || cd.vigencia || cd.dataVigencia || '')
      );
      const planoLoaded = String(cd.nomePlano || cd.tipoDePlano || cd.tipo || 'RC Advogados');

      // Desconto inicial (respeitando o teto de 40%)
      const descGravado = Number(cd.descontoManualPercent ?? cd.descontoPercentual ?? 0);
      const descInicial = Math.min(40, Math.max(0, descGravado));

      // Valores com saneamento inteligente contra multiplicação indevida (* 100)
      const rawCob = cotacao.importancia_segurada ?? cd.valorCobertura;
      const rawPrem = cotacao.premio_final ?? cd.valor;
      const sanitized = sanitizePlanFinancials({
        planoNome: planoLoaded,
        cobertura: rawCob,
        premio: rawPrem,
      });

      const parsedCobNum =
        sanitized.cobertura > 0
          ? sanitized.cobertura
          : rawCob !== undefined && rawCob !== null
          ? parseCurrencyToNumber(rawCob)
          : 0;
      setImportanciaSegurada(parsedCobNum > 0 ? String(parsedCobNum) : '');

      const parsedPremNum =
        sanitized.premio > 0
          ? sanitized.premio
          : rawPrem !== undefined && rawPrem !== null
          ? parseCurrencyToNumber(rawPrem)
          : 0;
      setPremioFinal(parsedPremNum > 0 ? String(parsedPremNum) : '');

      // Identifica o plano correspondente na lista (por tipo, nome ou cobertura oficial)
      const listaPlanos = planosDisponiveis.length > 0 ? planosDisponiveis : FALLBACK_PLANOS;
      const planoMatched = findMatchingPlano(
        listaPlanos,
        cd.tipoDePlano || cd.tipo,
        planoLoaded,
        parsedCobNum
      );

      let baseCalculado = Number(cd.valorOriginal || 0);

      if (planoMatched) {
        setSelectedPlanoTipo(planoMatched.tipoDePlano);
        setNomePlano(planoMatched.nomeExibido);
        const maxP = planoMatched.maxParcelas || (planoMatched.tipoDePlano === '100k' ? 1 : 6);
        setMaxParcelasPermitidas(maxP);

        const baseTabelaPlano = parseCurrencyToNumber(planoMatched.parcela);

        if (baseCalculado > 0 && baseCalculado >= parsedPremNum) {
          // Mantém baseCalculado
        } else if (baseTabelaPlano > 0) {
          baseCalculado = baseTabelaPlano;
        } else if (descInicial > 0 && descInicial < 100 && parsedPremNum > 0) {
          baseCalculado = Math.round((parsedPremNum / (1 - descInicial / 100)) * 100) / 100;
        } else {
          baseCalculado = parsedPremNum;
        }

        let descFinal = descInicial;
        if (descFinal === 0 && baseCalculado > parsedPremNum && parsedPremNum > 0) {
          const descCalculado = Math.round(((baseCalculado - parsedPremNum) / baseCalculado) * 100);
          if (descCalculado > 0) {
            descFinal = Math.min(40, Math.max(0, descCalculado));
          }
        }
        setDescontoPercent(descFinal);
      } else {
        setSelectedPlanoTipo('custom');
        setNomePlano(planoLoaded);
        setMaxParcelasPermitidas(12);

        if (!baseCalculado || baseCalculado <= 0) {
          if (descInicial > 0 && descInicial < 100 && parsedPremNum > 0) {
            baseCalculado = Math.round((parsedPremNum / (1 - descInicial / 100)) * 100) / 100;
          } else {
            baseCalculado = parsedPremNum;
          }
        }
        setDescontoPercent(descInicial);
      }

      setPremioBase(baseCalculado);
      setPremioBaseInput(baseCalculado > 0 ? String(baseCalculado) : '');

      setPlanoFranquia(String(cd.planoFranquia || 'R$ 1.000,00'));
      setParcelas(cd.parcela ? String(cd.parcela) : '1');
      setNotes(cotacao.notes || cd.observacoes || cd.notas || '');

      // Aba 3: Escritório & Atuação
      const regKey = regConfig.key;
      const ufKey = regConfig.ufKey || `${regKey}Uf`;
      const numRegCarregado = cd[regKey] || cd.registroProfissionalNumero || cd.oab || '';
      const ufRegCarregado =
        cd[ufKey] ||
        cd.registroProfissionalUf ||
        cd.ufOab ||
        cd.oabUf ||
        (cd.uf ? cd.uf.toUpperCase() : 'SP');
      setRegistroProfissionalNumero(numRegCarregado);
      setRegistroProfissionalUf(ufRegCarregado);
      setRqe(cd.rqe || '');

      const isAssoc =
        cd.associadoEscritorio === 'Sim' ||
        (Boolean(cd.escritorioAssociado) &&
          cd.escritorioAssociado !== 'Não associado' &&
          cd.escritorioAssociado !== 'Não')
          ? 'Sim'
          : 'Não';
      setAssociadoEscritorio(isAssoc);
      setNomeEscritorio(
        cd.nomeEscritorio ||
          (cd.escritorioAssociado && cd.escritorioAssociado !== 'Não associado'
            ? cd.escritorioAssociado
            : '') ||
          cd.escritorio ||
          ''
      );

      const titularidadeGravada = cd.titularidadeTipo || cd.titularidade || 'Graduação';
      const titularidadesConhecidas = [
        'Graduação',
        'Especialização',
        'Mestrado',
        'Doutorado',
        'Pós-Doutorado',
      ];
      if (titularidadesConhecidas.includes(titularidadeGravada)) {
        setTitularidadeTipo(titularidadeGravada);
        setTitularidadeOutro('');
      } else {
        setTitularidadeTipo('Outro');
        setTitularidadeOutro(cd.titularidadeOutro || titularidadeGravada || '');
      }

      setFaturamentoAntes(cd.faturamentoAntes ? formatMoneyInput(cd.faturamentoAntes) : '');
      setFaturamentoDepois(cd.faturamentoDepois ? formatMoneyInput(cd.faturamentoDepois) : '');

      // Especialidades e Áreas de Atuação
      let esps: string[] = [];
      if (Array.isArray(cd.especialidades)) {
        esps = cd.especialidades;
      } else if (typeof cd.especialidades === 'string' && cd.especialidades.trim()) {
        esps = cd.especialidades.split(',').map((s) => s.trim());
      } else if (Array.isArray(cd.atuacao)) {
        // Tenta mapear de volta a partir de rótulos conhecidos
        const todasDoRamo = resolvedRamoConfig.especialidades || [];
        esps = cd.atuacao
          .map((label: string) => {
            const found = todasDoRamo.find((e) => e.label.toLowerCase() === label.toLowerCase() || e.key.toLowerCase() === label.toLowerCase());
            return found ? found.key : null;
          })
          .filter(Boolean) as string[];
      }
      setEspecialidades(esps);
      setAtuacao(formatAtuacao(cd.atuacao || (esps.length > 0 ? esps.join(', ') : '')));

      // Aba 4: Underwriting / Questionário de Risco
      const riskQ = resolvedRamoConfig.questionarioRisco || [];
      const newAnswers: Record<string, 'Sim' | 'Não'> = {
        propostaRecusada: cd.propostaRecusada === 'Sim' ? 'Sim' : 'Não',
        reclamacaoProfissional: cd.reclamacaoProfissional === 'Sim' ? 'Sim' : 'Não',
        investigacaoAutoridade: cd.investigacaoAutoridade === 'Sim' ? 'Sim' : 'Não',
        fatoTerceiros: cd.fatoTerceiros === 'Sim' ? 'Sim' : 'Não',
        pagouReclamacao: cd.pagouReclamacao === 'Sim' ? 'Sim' : 'Não',
      };
      const newDetails: Record<string, string> = {
        propostaDetalhe: cd.propostaDetalhe || '',
        reclamacaoDetalhe: cd.reclamacaoDetalhe || '',
        investigacaoDetalhe: cd.investigacaoDetalhe || '',
        fatoDetalhe: cd.fatoDetalhe || '',
        pagouDetalhe: cd.pagouDetalhe || '',
      };

      riskQ.forEach((q) => {
        if (cd[q.id] !== undefined) {
          newAnswers[q.id] = cd[q.id] === 'Sim' ? 'Sim' : 'Não';
        }
        if (cd[q.detailKey] !== undefined) {
          newDetails[q.detailKey] = cd[q.detailKey] || '';
        }
      });
      setRiskAnswers(newAnswers);
      setRiskDetails(newDetails);

      // Seguro Anterior (Renovação)
      const isRenov =
        cd.isRenovacao === 'Sim' || cd.renovacao === true || cd.renovacao === 'Sim'
          ? 'Sim'
          : 'Não';
      setIsRenovacao(isRenov);
      setSeguradoraAnterior(cd.seguradoraAnterior || cd.seguradora || '');
      setVigenciaAnterior(formatDateToInput(cd.vigenciaAnterior || cd.vigencia || ''));
      setLimiteAnterior(cd.limiteAnterior || cd.limite ? formatMoneyInput(cd.limiteAnterior || cd.limite) : '');
      setFranquiaAnterior(cd.franquiaAnterior ? formatMoneyInput(cd.franquiaAnterior) : '');
      setDataRetroativa(formatDateToInput(cd.dataRetroativa || ''));

      // Pessoa Politicamente Exposta (PPE)
      setPpeCargos(cd.ppeCargos === 'Sim' ? 'Sim' : 'Não');
      setPpeRepresenta(cd.ppeRepresenta === 'Sim' ? 'Sim' : 'Não');
      setPpeCargoSelect(Array.isArray(cd.ppeCargoSelect) ? cd.ppeCargoSelect : []);

      setErrorMessage(null);
      setSuccessMessage(null);
      setCepSuccess(false);
      setActiveTab('cliente');
    }
  }, [isOpen, cotacao, regConfig, resolvedRamoConfig]);

  // Tecla ESC para fechar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !regerandoMinuta) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, saving, regerandoMinuta]);

  // Busca ViaCEP
  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const masked = maskCep(rawVal);
    setCep(masked);
    setCepSuccess(false);

    const digits = cleanDigits(rawVal).slice(0, 8);
    if (digits.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (response.ok) {
          const data = await response.json();
          if (!data.erro) {
            if (data.logradouro) setLogradouro(data.logradouro);
            if (data.bairro) setBairro(data.bairro);
            if (data.localidade) setCidade(data.localidade);
            if (data.uf) setUf(data.uf.toUpperCase());
            setCepSuccess(true);
            setTimeout(() => {
              numeroInputRef.current?.focus();
            }, 100);
          }
        }
      } catch {
        // Usuário segue preenchendo manualmente
      } finally {
        setLoadingCep(false);
      }
    }
  };

  // Seleção de serviço / plano de cobertura
  const handleSelectPlano = (tipoOuKey: string) => {
    setSelectedPlanoTipo(tipoOuKey);
    if (isFinancialLocked) return;

    if (tipoOuKey === 'custom') {
      setMaxParcelasPermitidas(12);
      return;
    }

    const plano =
      planosDisponiveis.find((p) => p.tipoDePlano === tipoOuKey) ||
      FALLBACK_PLANOS.find((p) => p.tipoDePlano === tipoOuKey);
    if (!plano) return;

    setNomePlano(plano.nomeExibido);

    const numCob = parseCurrencyToNumber(plano.cobertura);
    setImportanciaSegurada(numCob > 0 ? String(numCob) : plano.cobertura);
    setPlanoFranquia(plano.franquia || 'R$ 1.000,00');

    const base = parseCurrencyToNumber(plano.parcela);
    setPremioBase(base);
    setPremioBaseInput(base > 0 ? String(base) : '');

    const fator = 1 - descontoPercent / 100;
    const novoFinal = Math.round(base * fator * 100) / 100;
    setPremioFinal(String(novoFinal));

    const maxP = plano.maxParcelas || (plano.tipoDePlano.toLowerCase() === '100k' ? 1 : 6);
    setMaxParcelasPermitidas(maxP);
    if (Number(parcelas) > maxP) {
      setParcelas(String(maxP));
    }
  };

  // Alteração direta do Prêmio de Tabela (Base)
  const handlePremioBaseChange = (novoBase: number) => {
    setPremioBase(novoBase);
    setPremioBaseInput(String(novoBase));
    if (isFinancialLocked) return;

    if (novoBase > 0) {
      const fator = 1 - descontoPercent / 100;
      const novoFinal = Math.round(novoBase * fator * 100) / 100;
      setPremioFinal(String(novoFinal));
    }
  };

  // Alteração de desconto comercial (0% a 40%)
  const handleDescontoChange = (novoPercent: number) => {
    if (isFinancialLocked) return;
    const descSeguro = Math.min(40, Math.max(0, Math.round(novoPercent)));
    setDescontoPercent(descSeguro);

    if (premioBase > 0) {
      const fator = 1 - descSeguro / 100;
      const novoFinal = Math.round(premioBase * fator * 100) / 100;
      setPremioFinal(String(novoFinal));
    } else {
      const curFinal = parseCurrencyToNumber(premioFinal);
      if (curFinal > 0) {
        const baseDeduzida =
          descontoPercent > 0 && descontoPercent < 100
            ? curFinal / (1 - descontoPercent / 100)
            : curFinal;
        setPremioBase(Math.round(baseDeduzida * 100) / 100);
        setPremioBaseInput(String(Math.round(baseDeduzida * 100) / 100));
        const novoFinal = Math.round(baseDeduzida * (1 - descSeguro / 100) * 100) / 100;
        setPremioFinal(String(novoFinal));
      }
    }
  };

  // Alteração manual do campo de prêmio total
  const handlePremioFinalChange = (rawVal: string) => {
    setPremioFinal(rawVal);
    if (isFinancialLocked) return;
    const num = parseCurrencyToNumber(rawVal);
    if (premioBase > 0 && num > 0 && num <= premioBase) {
      const descCalculado = Math.round(((premioBase - num) / premioBase) * 100);
      if (descCalculado >= 0 && descCalculado <= 40) {
        setDescontoPercent(descCalculado);
      }
    }
  };

  // Opções de parcelamento em tempo real
  const opcoesParcelamento = useMemo(() => {
    const finalNum = parseCurrencyToNumber(premioFinal);
    const limit = Math.max(1, maxParcelasPermitidas || 6);
    const list: { qtd: number; valorParcela: number; total: number; label: string }[] = [];

    for (let i = 1; i <= limit; i++) {
      const vParc = finalNum > 0 ? Math.round((finalNum / i) * 100) / 100 : 0;
      const label =
        i === 1
          ? `1x de ${formatCurrencyBRL(vParc)} à vista`
          : `${i}x de ${formatCurrencyBRL(vParc)} (Total: ${formatCurrencyBRL(finalNum)})`;
      list.push({ qtd: i, valorParcela: vParc, total: finalNum, label });
    }
    return list;
  }, [premioFinal, maxParcelasPermitidas]);

  // Manipulação de Especialidades da Aba 3
  const handleToggleEspecialidade = (espKey: string) => {
    setEspecialidades((prev) => {
      const exists = prev.includes(espKey);
      const updated = exists ? prev.filter((k) => k !== espKey) : [...prev, espKey];
      // Mantém atuacao sincronizado com os labels
      const todasEspecialidades = resolvedRamoConfig.especialidades || [];
      const labels = updated.map((k) => {
        const found = todasEspecialidades.find((e) => e.key === k);
        return found ? found.label : k;
      });
      setAtuacao(labels.join(', '));
      return updated;
    });
  };

  // Manipulação de Respostas de Underwriting
  const handleSetRiskAnswer = (questionId: string, answer: 'Sim' | 'Não') => {
    setRiskAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSetRiskDetail = (detailKey: string, detailText: string) => {
    setRiskDetails((prev) => ({ ...prev, [detailKey]: detailText }));
  };

  // Manipulação de Cargos PPE
  const handleTogglePpeCargo = (cargoId: string) => {
    setPpeCargoSelect((prev) => {
      return prev.includes(cargoId)
        ? prev.filter((id) => id !== cargoId)
        : [...prev, cargoId];
    });
  };

  // Submissão unificada (Salvar ou Salvar & Regerar Minuta)
  const salvarDados = async (forceRegerarMinuta: boolean) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = clientName.trim();
    if (!cleanName) {
      setErrorMessage('O nome do cliente é obrigatório.');
      setActiveTab('cliente');
      return;
    }

    const docDigits = cleanDigits(clientCpfCnpj);
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setErrorMessage('O CPF/CNPJ deve ter 11 ou 14 dígitos válidos.');
      setActiveTab('cliente');
      return;
    }

    if (associadoEscritorio === 'Sim' && !nomeEscritorio.trim()) {
      setErrorMessage('Informe o nome do escritório ou selecione "Não" na associação a escritório.');
      setActiveTab('escritorio');
      return;
    }

    // Validação de underwriting: se alguma pergunta afirmativa exige justificativa
    const perguntasRisco = resolvedRamoConfig.questionarioRisco || [];
    for (const q of perguntasRisco) {
      const ans = riskAnswers[q.id] || 'Não';
      const det = riskDetails[q.detailKey] || '';
      if (ans === 'Sim' && q.requiredOnAffirmative && !det.trim()) {
        setErrorMessage(`Por favor, justifique a resposta afirmativa na declaração de risco.`);
        setActiveTab('risco');
        return;
      }
    }

    if (forceRegerarMinuta) {
      setRegerandoMinuta(true);
    } else {
      setSaving(true);
    }

    try {
      const existingClientData = parseRawClientData(cotacao.client_data);

      const titularidadeFinal =
        titularidadeTipo === 'Outro' ? titularidadeOutro.trim() : titularidadeTipo;

      const todasEspecialidades = resolvedRamoConfig.especialidades || [];
      const labelsEspecialidades = especialidades.map((k) => {
        const found = todasEspecialidades.find((e) => e.key === k);
        return found ? found.label : k;
      });
      const parsedAtuacaoListFinal =
        parseAtuacaoList(atuacao.trim()).length > 0
          ? parseAtuacaoList(atuacao.trim())
          : labelsEspecialidades.length > 0
          ? labelsEspecialidades
          : existingClientData.atuacao;

      const regKey = regConfig.key;
      const ufKey = regConfig.ufKey || `${regKey}Uf`;

      const updatedClientData: Record<string, any> = {
        ...existingClientData,
        // Cliente & Endereço
        nome: cleanName,
        cpfCnpj: docDigits,
        email: clientEmail.trim() || existingClientData.email,
        celular: cleanDigits(clientPhone) || existingClientData.celular,
        dataNascto: birthDate || existingClientData.dataNascto,
        cep: cleanDigits(cep) || existingClientData.cep,
        logradouro: logradouro.trim() || existingClientData.logradouro,
        numero: numero.trim() || existingClientData.numero,
        complemento: complemento.trim() || existingClientData.complemento,
        bairro: bairro.trim() || existingClientData.bairro,
        cidade: cidade.trim() || existingClientData.cidade,
        uf: uf.trim() ? uf.trim().toUpperCase() : existingClientData.uf,

        // Proposta & Vigência
        dataInicioVigencia: dataInicioVigencia || existingClientData.dataInicioVigencia,
        fimVigencia: calculatePolicyExpiryDate(dataInicioVigencia || existingClientData.dataInicioVigencia),
        vigencia: dataInicioVigencia || existingClientData.vigencia,
        nomePlano: nomePlano.trim() || existingClientData.nomePlano,
        tipoDePlano:
          selectedPlanoTipo !== 'custom'
            ? selectedPlanoTipo
            : existingClientData.tipoDePlano || nomePlano.trim(),
        tipo:
          selectedPlanoTipo !== 'custom'
            ? selectedPlanoTipo
            : existingClientData.tipo || nomePlano.trim(),
        planoFranquia: planoFranquia.trim() || existingClientData.planoFranquia,
        parcela: parcelas ? Number(parcelas) : existingClientData.parcela,
        observacoes: notes.trim() || existingClientData.observacoes,
        descontoManualPercent: descontoPercent,
        descontoPercentual: descontoPercent,
        valorOriginal: premioBase > 0 ? premioBase : existingClientData.valorOriginal || 0,

        // Registro de Classe (dinâmico e canônico)
        registroProfissionalNumero: registroProfissionalNumero.trim(),
        registroProfissionalUf: registroProfissionalUf.trim().toUpperCase(),
        rqe: rqe.trim(),
        [regKey]: registroProfissionalNumero.trim(),
        [ufKey]: registroProfissionalUf.trim().toUpperCase(),
        oab:
          regKey === 'oab'
            ? registroProfissionalNumero.trim()
            : existingClientData.oab || registroProfissionalNumero.trim(),
        oabUf:
          regKey === 'oab'
            ? registroProfissionalUf.trim().toUpperCase()
            : existingClientData.oabUf || registroProfissionalUf.trim().toUpperCase(),
        ufOab:
          regKey === 'oab'
            ? registroProfissionalUf.trim().toUpperCase()
            : existingClientData.ufOab || registroProfissionalUf.trim().toUpperCase(),

        // Escritório & Atuação
        associadoEscritorio: associadoEscritorio,
        nomeEscritorio: associadoEscritorio === 'Sim' ? nomeEscritorio.trim() : '',
        escritorioAssociado:
          associadoEscritorio === 'Sim'
            ? nomeEscritorio.trim() || 'Sim'
            : 'Não associado',
        escritorio: associadoEscritorio === 'Sim' ? nomeEscritorio.trim() : '',
        titularidade: titularidadeFinal,
        titularidadeTipo: titularidadeTipo,
        titularidadeOutro: titularidadeOutro.trim(),
        faturamentoAntes: faturamentoAntes.trim(),
        faturamentoDepois: faturamentoDepois.trim(),
        especialidades: especialidades,
        atuacao: parsedAtuacaoListFinal,

        // Questionário de Underwriting
        propostaRecusada: riskAnswers.propostaRecusada || 'Não',
        propostaDetalhe:
          riskAnswers.propostaRecusada === 'Sim'
            ? (riskDetails.propostaDetalhe || '').trim()
            : '',
        reclamacaoProfissional: riskAnswers.reclamacaoProfissional || 'Não',
        reclamacaoDetalhe:
          riskAnswers.reclamacaoProfissional === 'Sim'
            ? (riskDetails.reclamacaoDetalhe || '').trim()
            : '',
        investigacaoAutoridade: riskAnswers.investigacaoAutoridade || 'Não',
        investigacaoDetalhe:
          riskAnswers.investigacaoAutoridade === 'Sim'
            ? (riskDetails.investigacaoDetalhe || '').trim()
            : '',
        fatoTerceiros: riskAnswers.fatoTerceiros || 'Não',
        fatoDetalhe:
          riskAnswers.fatoTerceiros === 'Sim'
            ? (riskDetails.fatoDetalhe || '').trim()
            : '',
        pagouReclamacao: riskAnswers.pagouReclamacao || 'Não',
        pagouDetalhe:
          riskAnswers.pagouReclamacao === 'Sim'
            ? (riskDetails.pagouDetalhe || '').trim()
            : '',

        // Seguro Anterior (Renovação)
        isRenovacao: isRenovacao,
        renovacao: isRenovacao === 'Sim',
        seguradora: isRenovacao === 'Sim' ? seguradoraAnterior.trim() : '',
        seguradoraAnterior: isRenovacao === 'Sim' ? seguradoraAnterior.trim() : '',
        vigenciaAnterior: isRenovacao === 'Sim' ? vigenciaAnterior : '',
        limite: isRenovacao === 'Sim' ? limiteAnterior.trim() : '',
        limiteAnterior: isRenovacao === 'Sim' ? limiteAnterior.trim() : '',
        franquiaAnterior: isRenovacao === 'Sim' ? franquiaAnterior.trim() : '',
        dataRetroativa: isRenovacao === 'Sim' ? dataRetroativa : '',

        // PPE
        ppeCargos: ppeCargos,
        ppeRepresenta: ppeRepresenta,
        ppeCargoSelect:
          ppeCargos === 'Sim' || ppeRepresenta === 'Sim' ? ppeCargoSelect : [],
      };

      // Grava perguntas dinâmicas adicionais
      perguntasRisco.forEach((q) => {
        updatedClientData[q.id] = riskAnswers[q.id] || 'Não';
        updatedClientData[q.detailKey] =
          riskAnswers[q.id] === 'Sim' ? (riskDetails[q.detailKey] || '').trim() : '';
      });

      const payload: Record<string, any> = {
        client_name: cleanName,
        clientName: cleanName,
        client_cpf_cnpj: docDigits,
        clientCpfCnpj: docDigits,
        client_email: clientEmail.trim() || null,
        clientEmail: clientEmail.trim() || null,
        client_phone: cleanDigits(clientPhone) || null,
        clientPhone: cleanDigits(clientPhone) || null,
        birth_date: birthDate || null,
        birthDate: birthDate || null,
        notes: notes.trim() || null,
        descontoManualPercent: descontoPercent,
        descontoPercentual: descontoPercent,
        valorOriginal: premioBase > 0 ? premioBase : null,
        address: {
          cep: cleanDigits(cep) || null,
          logradouro: logradouro.trim() || null,
          numero: numero.trim() || null,
          complemento: complemento.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          uf: uf.trim() ? uf.trim().toUpperCase() : null,
        },
        proposalData: {
          oab:
            regKey === 'oab'
              ? registroProfissionalNumero.trim()
              : existingClientData.oab || null,
          oabUf:
            regKey === 'oab'
              ? registroProfissionalUf.trim().toUpperCase()
              : existingClientData.oabUf || null,
          registroProfissionalNumero: registroProfissionalNumero.trim() || null,
          registroProfissionalUf: registroProfissionalUf.trim().toUpperCase() || null,
          rqe: rqe.trim() || null,
          [regKey]: registroProfissionalNumero.trim() || null,
          [ufKey]: registroProfissionalUf.trim().toUpperCase() || null,
          atuacao: parsedAtuacaoListFinal,
          especialidades: especialidades,
          associadoEscritorio: associadoEscritorio,
          nomeEscritorio: associadoEscritorio === 'Sim' ? nomeEscritorio.trim() : null,
          titularidade: titularidadeFinal,
          faturamentoAntes: faturamentoAntes.trim() || null,
          faturamentoDepois: faturamentoDepois.trim() || null,
          isRenovacao: isRenovacao,
          seguradora: isRenovacao === 'Sim' ? seguradoraAnterior.trim() : null,
          dataInicioVigencia: dataInicioVigencia || null,
          planoNome: nomePlano.trim() || null,
          tipoDePlano: selectedPlanoTipo !== 'custom' ? selectedPlanoTipo : null,
          franquia: planoFranquia.trim() || null,
          parcela: parcelas ? Number(parcelas) : 1,
          notes: notes.trim() || null,
          descontoManualPercent: descontoPercent,
          valorOriginal: premioBase > 0 ? premioBase : null,
        },
        client_data: updatedClientData,
      };

      if (!isFinancialLocked) {
        const rawCobParsed = parseCurrencyToNumber(importanciaSegurada);
        const rawPremParsed = parseCurrencyToNumber(premioFinal);

        if (premioFinal.trim() !== '' && rawPremParsed <= 0) {
          setErrorMessage('O valor do prêmio deve ser um número válido maior que zero.');
          setActiveTab('proposta');
          setSaving(false);
          setRegerandoMinuta(false);
          return;
        }

        const { cobertura: parsedCobertura, premio: parsedPremio } = sanitizePlanFinancials({
          planoNome: nomePlano,
          cobertura: rawCobParsed,
          premio: rawPremParsed,
        });

        if (parsedCobertura > 0) {
          payload.importancia_segurada = parsedCobertura;
          payload.proposalData.importanciaSegurada = parsedCobertura;
          updatedClientData.valorCobertura = `R$ ${parsedCobertura.toLocaleString('pt-BR')}`;
          updatedClientData.importanciaSegurada = parsedCobertura;
        }
        if (parsedPremio > 0) {
          payload.premio_final = parsedPremio;
          payload.proposalData.premioFinal = parsedPremio;
          updatedClientData.valor = parsedPremio;
          updatedClientData.premioFinal = parsedPremio;
          const numParcelas = Number(parcelas) || 1;
          const vParc =
            numParcelas > 0 ? Math.round((parsedPremio / numParcelas) * 100) / 100 : parsedPremio;
          updatedClientData.valorParcela = vParc;
        }

        updatedClientData.descontoManualPercent = descontoPercent;
        updatedClientData.descontoPercentual = descontoPercent;
        updatedClientData.valorOriginal =
          premioBase > 0 ? premioBase : parsedPremio > 0 ? parsedPremio : 0;
      }

      // 1. Atualiza proposta via PATCH
      const res = await fetch(`/api/cotacoes/${cotacao.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(
          data.details
            ? `${data.error} (${data.details})`
            : data.error || 'Erro ao salvar os dados da proposta.'
        );
      }

      // 2. Se solicitado "Salvar & Regerar Minuta", dispara o endpoint de contrato
      if (forceRegerarMinuta) {
        const resContrato = await fetch(
          `/api/portal/cotacoes/${cotacao.id}/gerar-contrato`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forceRecreate: true }),
          }
        );

        const dataContrato = await resContrato.json();
        if (!resContrato.ok || !dataContrato.ok) {
          throw new Error(
            dataContrato.error ||
              'Proposta salva, mas ocorreu uma falha ao regerar a minuta no ZapSign.'
          );
        }

        setSuccessMessage('Proposta atualizada e nova Minuta gerada no ZapSign com sucesso!');
      } else {
        setSuccessMessage('Proposta atualizada com sucesso!');
      }

      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha na comunicação com o servidor.');
    } finally {
      setSaving(false);
      setRegerandoMinuta(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    salvarDados(false);
  };

  if (!isOpen || !mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-proposta-titulo"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!saving && !regerandoMinuta) onClose();
        }}
        aria-hidden="true"
      />

      {/* Container Principal */}
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com Identificação */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00d4e0]/10 border border-[#00d4e0]/30 flex items-center justify-center text-[#0e4a5a] shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="modal-editar-proposta-titulo"
                  className="text-lg font-bold text-gray-900 tracking-tight"
                >
                  Editar Proposta & Cotação
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 uppercase font-mono">
                  {cotacao.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Proposta ID: <span className="font-mono text-gray-700">{cotacao.id.slice(0, 8)}</span> · {cotacao.client_name} · <span className="text-[#0e4a5a] font-semibold">{resolvedRamoConfig.name}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || regerandoMinuta}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer disabled:opacity-50"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner de Aviso de Bloqueio Financeiro */}
        {isFinancialLocked && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 flex items-start gap-3 text-xs overflow-hidden">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-bold text-amber-950 block mb-1">
                Valores Financeiros Preservados:
              </span>
              <p className="text-amber-800 leading-relaxed break-words whitespace-normal m-0">
                Esta proposta possui contrato assinado ou cobrança gerada. Os dados cadastrais, escritório, declarações de risco e vigência podem ser alterados livremente. Os valores financeiros (cobertura e prêmio) estão preservados para manter a conformidade legal.
              </p>
            </div>
          </div>
        )}

        {/* Navegação por 4 Abas Estilizadas */}
        <div className="px-6 pt-4 border-b border-gray-200 bg-white overflow-x-auto no-scrollbar">
          <div className="flex gap-2 min-w-max pb-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('cliente')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 -mb-[2px] min-h-[44px] cursor-pointer ${
                activeTab === 'cliente'
                  ? 'border-[#0e4a5a] text-[#0e4a5a] bg-teal-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" />
              <span>1. Cliente & Endereço</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('proposta')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 -mb-[2px] min-h-[44px] cursor-pointer ${
                activeTab === 'proposta'
                  ? 'border-[#0e4a5a] text-[#0e4a5a] bg-teal-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>2. Proposta & Seguro</span>
              {isFinancialLocked && (
                <span className="inline-flex" aria-label="Valores financeiros bloqueados">
                  <Lock className="w-3 h-3 text-amber-600" />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('escritorio')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 -mb-[2px] min-h-[44px] cursor-pointer ${
                activeTab === 'escritorio'
                  ? 'border-[#0e4a5a] text-[#0e4a5a] bg-teal-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>3. Escritório & Atuação</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('risco')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 -mb-[2px] min-h-[44px] cursor-pointer ${
                activeTab === 'risco'
                  ? 'border-[#0e4a5a] text-[#0e4a5a] bg-teal-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>4. Risco & Declarações</span>
              {(riskAnswers.propostaRecusada === 'Sim' ||
                riskAnswers.reclamacaoProfissional === 'Sim' ||
                riskAnswers.investigacaoAutoridade === 'Sim' ||
                riskAnswers.fatoTerceiros === 'Sim' ||
                riskAnswers.pagouReclamacao === 'Sim' ||
                isRenovacao === 'Sim') && (
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              )}
            </button>
          </div>
        </div>

        {/* Formulário com Abas */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Mensagem de Erro */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs overflow-hidden">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0 break-words">{errorMessage}</span>
              </div>
            )}

            {/* Mensagem de Sucesso */}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs overflow-hidden">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0 break-words">{successMessage}</span>
              </div>
            )}

            {/* ================================================================== */}
            {/* ABA 1: DADOS DO CLIENTE & ENDEREÇO                                  */}
            {/* ================================================================== */}
            {activeTab === 'cliente' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                    Identificação do Segurado
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Nome do Segurado / Razão Social <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Ex: Dra. Ana Paula Silva"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        CPF ou CNPJ <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={clientCpfCnpj}
                        onChange={(e) => setClientCpfCnpj(maskCpfCnpj(e.target.value))}
                        placeholder="000.000.000-00 ou CNPJ"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Data de Nascimento
                      </label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        E-mail de Contato
                      </label>
                      <input
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="cliente@email.com"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Celular / WhatsApp
                      </label>
                      <input
                        type="tel"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(maskPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                      Endereço Cadastrado
                    </h3>
                    {loadingCep && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#0e4a5a] font-medium animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin text-[#00d4e0]" /> Buscando CEP...
                      </span>
                    )}
                    {cepSuccess && !loadingCep && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Endereço carregado
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">CEP</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={cep}
                          onChange={handleCepChange}
                          placeholder="00000-000"
                          maxLength={9}
                          className="w-full rounded-xl border border-gray-300 bg-white pl-3.5 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-mono"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                          {loadingCep ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#00d4e0]" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Logradouro
                      </label>
                      <input
                        type="text"
                        value={logradouro}
                        onChange={(e) => setLogradouro(e.target.value)}
                        placeholder="Rua, Avenida, Praça..."
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Número</label>
                      <input
                        ref={numeroInputRef}
                        type="text"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="123"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Complemento
                      </label>
                      <input
                        type="text"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                        placeholder="Sala 302, Andar 3"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Bairro</label>
                      <input
                        type="text"
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                        placeholder="Centro"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cidade</label>
                      <input
                        type="text"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        placeholder="São Paulo"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">UF</label>
                      <select
                        value={uf}
                        onChange={(e) => setUf(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all cursor-pointer"
                      >
                        <option value="">Selecione</option>
                        {BRAZILIAN_UFS.map((sigla) => (
                          <option key={sigla} value={sigla}>
                            {sigla}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================== */}
            {/* ABA 2: DADOS DA PROPOSTA & SEGURO                                  */}
            {/* ================================================================== */}
            {activeTab === 'proposta' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Seção 1: Serviço & Plano de Cobertura */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#00d4e0]" />
                      Serviço / Plano de Cobertura
                    </h3>
                    {loadingPlanos && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#0e4a5a] font-medium animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin text-[#00d4e0]" /> Buscando planos do produto...
                      </span>
                    )}
                    {isFinancialLocked && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                        <Lock className="w-3 h-3" /> Bloqueado
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Selecione o Serviço / Plano Disponível
                      </label>
                      <select
                        disabled={isFinancialLocked}
                        value={selectedPlanoTipo}
                        onChange={(e) => handleSelectPlano(e.target.value)}
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all cursor-pointer ${
                          isFinancialLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-white border-gray-300 text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20'
                        }`}
                      >
                        {planosDisponiveis.map((p) => (
                          <option key={p.tipoDePlano} value={p.tipoDePlano}>
                            {p.nomeExibido} — Cobertura: {p.cobertura} · Franquia: {p.franquia} · Tabela: {p.parcela}
                          </option>
                        ))}
                        <option value="custom">Outro Plano / Personalizado</option>
                      </select>
                    </div>

                    {selectedPlanoTipo === 'custom' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Nome Personalizado do Plano
                        </label>
                        <input
                          type="text"
                          value={nomePlano}
                          onChange={(e) => setNomePlano(e.target.value)}
                          placeholder="Ex: RC Advogados Especial"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção 2: Desconto Comercial da Proposta (0% a 40%) */}
                <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                        <Percent className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                            Desconto Comercial da Proposta
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            0% a 40% Máx
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800/80 mt-0.5">
                          Ajuste o percentual comercial para recalcular o prêmio e as parcelas em tempo real.
                        </p>
                      </div>
                    </div>

                    {isFinancialLocked && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-semibold bg-amber-100/70 border border-amber-300 px-2.5 py-1 rounded-full">
                        <Lock className="w-3 h-3 text-amber-700" /> Desconto Bloqueado
                      </span>
                    )}
                  </div>

                  {/* Slider e Input */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={1}
                        disabled={isFinancialLocked}
                        value={descontoPercent}
                        onChange={(e) => handleDescontoChange(Number(e.target.value))}
                        className={`flex-1 h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-[#0e4a5a] ${
                          isFinancialLocked ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      />
                      <div className="flex items-center gap-1 min-w-[90px] bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
                        <input
                          type="number"
                          min={0}
                          max={40}
                          step={1}
                          disabled={isFinancialLocked}
                          value={descontoPercent}
                          onChange={(e) => handleDescontoChange(Number(e.target.value))}
                          className="w-12 text-sm font-bold text-gray-900 text-right focus:outline-none disabled:bg-transparent"
                        />
                        <span className="text-xs font-bold text-gray-500">%</span>
                      </div>
                    </div>

                    {/* Atalhos Rápidos */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-emerald-900 mr-1">Atalhos:</span>
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40].map((pct) => {
                        const isCurrent = descontoPercent === pct;
                        return (
                          <button
                            key={pct}
                            type="button"
                            disabled={isFinancialLocked}
                            onClick={() => handleDescontoChange(pct)}
                            className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                              isCurrent
                                ? 'bg-[#0e4a5a] text-white shadow-xs scale-105'
                                : 'bg-white border border-emerald-200 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px]`}
                          >
                            {pct}%
                          </button>
                        );
                      })}
                    </div>

                    {/* Simulação e Resumo Financeiro */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-emerald-200/60 text-xs">
                      <div className="bg-white/90 border border-emerald-200/80 rounded-xl p-2.5 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-gray-600 block text-[11px] font-semibold">
                            Prêmio de Tabela (Base R$)
                          </label>
                          {!isFinancialLocked && (
                            <span className="text-[10px] text-gray-400 font-normal">
                              Editável
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          disabled={isFinancialLocked}
                          value={
                            isEditingPremioBase
                              ? premioBaseInput
                              : premioBase > 0
                              ? formatCurrencyBRL(premioBase)
                              : ''
                          }
                          onFocus={() => {
                            setIsEditingPremioBase(true);
                            setPremioBaseInput(premioBase > 0 ? String(premioBase) : '');
                          }}
                          onBlur={() => {
                            setIsEditingPremioBase(false);
                            const parsed = parseCurrencyToNumber(premioBaseInput);
                            if (parsed > 0) {
                              handlePremioBaseChange(parsed);
                            }
                          }}
                          onChange={(e) => {
                            setPremioBaseInput(e.target.value);
                            const parsed = parseCurrencyToNumber(e.target.value);
                            if (parsed > 0) {
                              handlePremioBaseChange(parsed);
                            }
                          }}
                          placeholder="R$ 680,00"
                          className={`w-full text-sm font-bold text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0]/20 ${
                            isFinancialLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                          }`}
                        />
                      </div>

                      <div className="bg-white/90 border border-emerald-200/80 rounded-xl p-2.5 flex flex-col justify-between">
                        <span className="text-emerald-700 block text-[11px] font-semibold mb-1">
                          Economia Aplicada ({descontoPercent}%)
                        </span>
                        <span className="font-bold text-emerald-700 text-sm py-1">
                          -{' '}
                          {formatCurrencyBRL(
                            Math.round(
                              (premioBase > 0 ? premioBase : parseCurrencyToNumber(premioFinal)) *
                                (descontoPercent / 100) *
                                100
                            ) / 100
                          )}
                        </span>
                      </div>

                      <div className="bg-emerald-100/70 border border-emerald-300/80 rounded-xl p-2.5 flex flex-col justify-between">
                        <span className="text-emerald-950 block text-[11px] font-bold mb-1">
                          Prêmio Final Líquido
                        </span>
                        <span className="font-extrabold text-[#0e4a5a] text-sm py-1">
                          {formatCurrencyBRL(parseCurrencyToNumber(premioFinal))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 3: Condições do Seguro & Vigência */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                    Condições do Seguro & Vigência
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Início da Vigência
                      </label>
                      <input
                        type="date"
                        value={dataInicioVigencia}
                        onChange={(e) => setDataInicioVigencia(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                      {dataInicioVigencia && (
                        <span className="text-[11px] text-gray-500 mt-1 block">
                          Vigência anual até <strong className="text-gray-700 font-semibold">{formatDate(calculatePolicyExpiryDate(dataInicioVigencia))}</strong>
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-gray-700">
                          Importância Segurada (Cobertura)
                        </label>
                        {isFinancialLocked && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                            <Lock className="w-3 h-3" /> Bloqueado
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={isFinancialLocked}
                        value={
                          isFinancialLocked
                            ? formatCurrencyBRL(
                                sanitizePlanFinancials({
                                  planoNome: nomePlano,
                                  cobertura: importanciaSegurada,
                                }).cobertura || importanciaSegurada
                              )
                            : importanciaSegurada
                        }
                        onChange={(e) => setImportanciaSegurada(e.target.value)}
                        placeholder="R$ 100.000,00"
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all ${
                          isFinancialLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-white border-gray-300 text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Franquia Contratada
                      </label>
                      <input
                        type="text"
                        value={planoFranquia}
                        onChange={(e) => setPlanoFranquia(e.target.value)}
                        placeholder="Ex: R$ 1.000,00"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção 4: Formas de Pagamento & Parcelamento */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                    <CreditCard className="w-4 h-4 text-[#00d4e0]" />
                    Formas de Pagamento & Prêmio Final
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-gray-700">
                          Prêmio Total Final (R$)
                        </label>
                        {isFinancialLocked && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                            <Lock className="w-3 h-3" /> Bloqueado
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={isFinancialLocked}
                        value={
                          isFinancialLocked
                            ? formatCurrencyBRL(
                                sanitizePlanFinancials({
                                  planoNome: nomePlano,
                                  premio: premioFinal,
                                }).premio || premioFinal
                              )
                            : premioFinal
                        }
                        onChange={(e) => handlePremioFinalChange(e.target.value)}
                        placeholder="R$ 361,67"
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-all ${
                          isFinancialLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-white border-gray-300 text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Condição de Pagamento (Parcelas Permitidas)
                      </label>
                      <select
                        value={parcelas}
                        onChange={(e) => setParcelas(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all cursor-pointer"
                      >
                        {opcoesParcelamento.map((op) => (
                          <option key={op.qtd} value={String(op.qtd)}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {maxParcelasPermitidas === 1 && (
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sky-900 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>Este plano possui condição simplificada exclusiva de pagamento à vista (1x).</span>
                    </div>
                  )}
                </div>

                {/* Observações / Notas Internas */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Observações / Notas Internas da Proposta
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Informações adicionais, histórico de negociação ou anotações da equipe..."
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>
              </div>
            )}

            {/* ================================================================== */}
            {/* ABA 3: ESCRITÓRIO & ATUAÇÃO                                        */}
            {/* ================================================================== */}
            {activeTab === 'escritorio' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Ramo e Registro Profissional */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-[#00d4e0]" />
                      Registro de Classe & Ramo Profissional
                    </h3>
                    <span className="text-[11px] font-semibold text-[#0e4a5a] bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                      {resolvedRamoConfig.name}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        {regConfig.label} {regConfig.required && <span className="text-rose-500">*</span>}
                      </label>
                      <input
                        type="text"
                        value={registroProfissionalNumero}
                        onChange={(e) => setRegistroProfissionalNumero(e.target.value)}
                        placeholder={regConfig.placeholder}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        UF do Registro {regConfig.required && <span className="text-rose-500">*</span>}
                      </label>
                      <select
                        value={registroProfissionalUf}
                        onChange={(e) => setRegistroProfissionalUf(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all cursor-pointer font-semibold"
                      >
                        <option value="">Selecione UF</option>
                        {BRAZILIAN_UFS.map((sigla) => (
                          <option key={sigla} value={sigla}>
                            {sigla}
                          </option>
                        ))}
                      </select>
                    </div>

                    {regConfig.hasRqe && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          RQE (Qualificação de Especialista)
                        </label>
                        <input
                          type="text"
                          value={rqe}
                          onChange={(e) => setRqe(e.target.value)}
                          placeholder="Número RQE (opcional)"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Associação a Escritório */}
                <div className="bg-gray-50 border border-gray-200 p-5 rounded-2xl space-y-4 shadow-2xs">
                  <div>
                    <span className="block text-sm font-bold text-gray-900">
                      O profissional é associado a algum escritório ou sociedade?
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Esta informação constará expressamente no contrato emitido e na apólice de seguro.
                    </p>

                    <div className="flex items-center gap-3 pt-3">
                      <button
                        type="button"
                        onClick={() => setAssociadoEscritorio('Sim')}
                        className={`min-h-[44px] min-w-[80px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          associadoEscritorio === 'Sim'
                            ? 'bg-[#0e4a5a] text-white border-[#0e4a5a] shadow-xs'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {associadoEscritorio === 'Sim' && <Check className="w-4 h-4 text-[#00d4e0]" />}
                        Sim
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAssociadoEscritorio('Não');
                          setNomeEscritorio('');
                        }}
                        className={`min-h-[44px] min-w-[80px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          associadoEscritorio === 'Não'
                            ? 'bg-[#0e4a5a] text-white border-[#0e4a5a] shadow-xs'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {associadoEscritorio === 'Não' && <Check className="w-4 h-4 text-[#00d4e0]" />}
                        Não
                      </button>
                    </div>
                  </div>

                  {associadoEscritorio === 'Sim' && (
                    <div className="pt-3 border-t border-gray-200/80 animate-in fade-in duration-150">
                      <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                        Nome do Escritório / Razão Social da Sociedade <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={nomeEscritorio}
                        onChange={(e) => setNomeEscritorio(e.target.value)}
                        placeholder="Ex: Albuquerque & Silveira Sociedade de Advogados"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                      />
                      <span className="text-[11px] text-gray-500 mt-1 block">
                        Informe o nome completo da sociedade de advogados ou pessoa jurídica conveniada.
                      </span>
                    </div>
                  )}
                </div>

                {/* Titularidade Profissional */}
                <div className="bg-gray-50 border border-gray-200 p-5 rounded-2xl space-y-4 shadow-2xs">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-1">
                      Titularidade do Profissional
                    </label>
                    <p className="text-xs text-gray-500 mb-2.5">
                      Grau acadêmico, título ou especialização registrado na minuta.
                    </p>
                    <select
                      value={titularidadeTipo}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTitularidadeTipo(val);
                        if (val !== 'Outro') {
                          setTitularidadeOutro('');
                        }
                      }}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all cursor-pointer"
                    >
                      <option value="Graduação">Graduação</option>
                      <option value="Especialização">Especialização</option>
                      <option value="Mestrado">Mestrado</option>
                      <option value="Doutorado">Doutorado</option>
                      <option value="Pós-Doutorado">Pós-Doutorado</option>
                      <option value="Outro">Outro (especificar)</option>
                    </select>
                  </div>

                  {titularidadeTipo === 'Outro' && (
                    <div className="pt-3 border-t border-gray-200/80 animate-in fade-in duration-150">
                      <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                        Especifique a Titularidade <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={titularidadeOutro}
                        onChange={(e) => setTitularidadeOutro(e.target.value)}
                        placeholder="Ex: Residência Médica, MBA Executivo, etc."
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                      />
                    </div>
                  )}
                </div>

                {/* Faturamento Anual (se aplicável ao ramo) */}
                {resolvedRamoConfig.hasFaturamento !== false && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                      {resolvedRamoConfig.faturamentoLabel || 'Faturamento Bruto Anual'}
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Faturamento Bruto (Últimos 12 meses)
                        </label>
                        <input
                          type="text"
                          value={faturamentoAntes}
                          onChange={(e) => setFaturamentoAntes(formatMoneyInput(e.target.value))}
                          placeholder="R$ 0,00"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Faturamento Estimado (Próximos 12 meses)
                        </label>
                        <input
                          type="text"
                          value={faturamentoDepois}
                          onChange={(e) => setFaturamentoDepois(formatMoneyInput(e.target.value))}
                          placeholder="R$ 0,00"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Áreas de Atuação e Especialidades Dinâmicas */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-[#00d4e0]" />
                      {resolvedRamoConfig.especialidadesLabel || 'Áreas de Atuação e Especialidades'}
                    </h3>
                    <span className="text-[11px] font-semibold text-gray-500">
                      {especialidades.length} selecionada(s)
                    </span>
                  </div>

                  {resolvedRamoConfig.especialidades && resolvedRamoConfig.especialidades.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {resolvedRamoConfig.especialidades.map((esp) => {
                        const isChecked = especialidades.includes(esp.key);
                        return (
                          <label
                            key={esp.key}
                            className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all cursor-pointer min-h-[44px] ${
                              isChecked
                                ? 'border-[#0e4a5a] bg-teal-50/50 shadow-2xs ring-1 ring-[#0e4a5a]/20'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start space-x-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleEspecialidade(esp.key)}
                                className="mt-0.5 rounded border-gray-300 text-[#0e4a5a] focus:ring-[#00d4e0] h-4 w-4 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-gray-900 block leading-snug">
                                  {esp.label}
                                </span>
                                {esp.description && (
                                  <span className="text-[11px] text-gray-500 block mt-0.5 leading-tight">
                                    {esp.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Nenhuma especialidade pré-definida para este ramo.
                    </p>
                  )}

                  {/* Campo de texto livre de atuação para ajuste fino */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Resumo Formatado da Atuação (Texto Livre)
                    </label>
                    <input
                      type="text"
                      list="atuacao-options"
                      value={atuacao}
                      onChange={(e) => setAtuacao(e.target.value)}
                      placeholder="Ex: Civil, Trabalhista, Tributário..."
                      className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                    />
                    <datalist id="atuacao-options">
                      {AREAS_ATUACAO_SUGESTOES.map((area) => (
                        <option key={area} value={area} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================== */}
            {/* ABA 4: HISTÓRICO DE RISCO (UNDERWRITING) & DECLARAÇÕES            */}
            {/* ================================================================== */}
            {activeTab === 'risco' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* 1. Questionário de Underwriting Dinâmico */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                        <ClipboardCheck className="w-4 h-4 text-[#00d4e0]" />
                        Questionário de Risco & Underwriting
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Respostas oficiais de underwriting do ramo. Em caso de resposta afirmativa (&quot;Sim&quot;), a justificativa circunstanciada é obrigatória.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    {(resolvedRamoConfig.questionarioRisco || []).map((item) => {
                      const respostaAtual = riskAnswers[item.id] || 'Não';
                      const detalheAtual = riskDetails[item.detailKey] || '';
                      const isSim = respostaAtual === 'Sim';

                      return (
                        <div
                          key={item.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isSim
                              ? 'bg-rose-50/40 border-rose-200 shadow-2xs'
                              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          } space-y-3`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <p className="text-xs sm:text-sm text-gray-800 font-medium leading-relaxed flex-1 min-w-0 pr-0 sm:pr-4">
                              {item.question}
                            </p>

                            <div
                              role="radiogroup"
                              aria-label={item.question}
                              className="inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center bg-gray-200/80 p-1 rounded-xl border border-gray-200"
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={!isSim}
                                onClick={() => handleSetRiskAnswer(item.id, 'Não')}
                                className={`min-w-[64px] min-h-[44px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                                  !isSim
                                    ? 'bg-white text-gray-900 shadow-xs border border-gray-200/80 font-bold'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                                }`}
                              >
                                Não
                              </button>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={isSim}
                                onClick={() => handleSetRiskAnswer(item.id, 'Sim')}
                                className={`min-w-[64px] min-h-[44px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                                  isSim
                                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                                }`}
                              >
                                Sim
                              </button>
                            </div>
                          </div>

                          {isSim && (
                            <div className="pt-2 border-t border-rose-200/80 animate-in fade-in duration-150">
                              <label className="block text-xs font-semibold text-rose-900 mb-1.5">
                                {item.detailLabel || 'Justificativa circunstanciada'} <span className="text-rose-600">*</span>
                              </label>
                              <textarea
                                required
                                rows={2}
                                value={detalheAtual}
                                onChange={(e) => handleSetRiskDetail(item.detailKey, e.target.value)}
                                placeholder="Informe os detalhes do ocorrido, datas, processos e valores..."
                                className="w-full rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all font-medium"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Bloco de Seguro Anterior (Renovação) */}
                <div className="bg-gray-50 border border-gray-200 p-5 rounded-2xl space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-200/60">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                        <History className="w-4 h-4 text-[#00d4e0]" />
                        Seguro Anterior (Renovação)
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Trata-se de renovação de apólice de seguro emitida por outra seguradora?
                      </p>
                    </div>

                    <div className="inline-flex items-center gap-1.5 bg-gray-200/80 p-1 rounded-xl border border-gray-200 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsRenovacao('Não')}
                        className={`min-w-[64px] min-h-[44px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                          isRenovacao === 'Não'
                            ? 'bg-white text-gray-900 shadow-xs border border-gray-200/80 font-bold'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                        }`}
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRenovacao('Sim')}
                        className={`min-w-[64px] min-h-[44px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                          isRenovacao === 'Sim'
                            ? 'bg-[#0e4a5a] text-white shadow-xs font-bold'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                        }`}
                      >
                        Sim
                      </button>
                    </div>
                  </div>

                  {isRenovacao === 'Sim' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Seguradora Anterior <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={seguradoraAnterior}
                          onChange={(e) => setSeguradoraAnterior(e.target.value)}
                          placeholder="Ex: Porto Seguro, Kovr, Tokio Marine"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Vigência Anterior
                        </label>
                        <input
                          type="date"
                          value={vigenciaAnterior}
                          onChange={(e) => setVigenciaAnterior(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Limite Segurado Anterior (R$)
                        </label>
                        <input
                          type="text"
                          value={limiteAnterior}
                          onChange={(e) => setLimiteAnterior(formatMoneyInput(e.target.value))}
                          placeholder="R$ 0,00"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Franquia Anterior (R$)
                        </label>
                        <input
                          type="text"
                          value={franquiaAnterior}
                          onChange={(e) => setFranquiaAnterior(formatMoneyInput(e.target.value))}
                          placeholder="R$ 0,00"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Data de Retroatividade
                        </label>
                        <input
                          type="date"
                          value={dataRetroativa}
                          onChange={(e) => setDataRetroativa(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Bloco PPE (Pessoa Politicamente Exposta) */}
                {resolvedRamoConfig.hasPpe !== false && (
                  <div className="bg-gray-50 border border-gray-200 p-5 rounded-2xl space-y-4 shadow-2xs">
                    <div className="border-b border-gray-200/60 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-[#00d4e0]" />
                        Pessoa Politicamente Exposta (PPE)
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Declarações de conformidade regulatória e compliance.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white border border-gray-200 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                        <span className="text-xs font-semibold text-gray-800 leading-snug">
                          Você ou sua empresa ocupou cargo público relevante nos últimos 5 anos?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPpeCargos('Não')}
                            className={`min-h-[44px] px-4 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              ppeCargos === 'Não'
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            Não
                          </button>
                          <button
                            type="button"
                            onClick={() => setPpeCargos('Sim')}
                            className={`min-h-[44px] px-4 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              ppeCargos === 'Sim'
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            Sim
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                        <span className="text-xs font-semibold text-gray-800 leading-snug">
                          Seu sócio, cônjuge ou representante legal é PPE?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPpeRepresenta('Não')}
                            className={`min-h-[44px] px-4 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              ppeRepresenta === 'Não'
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            Não
                          </button>
                          <button
                            type="button"
                            onClick={() => setPpeRepresenta('Sim')}
                            className={`min-h-[44px] px-4 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              ppeRepresenta === 'Sim'
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            Sim
                          </button>
                        </div>
                      </div>
                    </div>

                    {(ppeCargos === 'Sim' || ppeRepresenta === 'Sim') && (
                      <div className="pt-3 border-t border-gray-200/80 space-y-2 animate-in fade-in duration-150">
                        <span className="block text-xs font-bold text-gray-900 mb-1">
                          Selecione as funções públicas ocupadas:
                        </span>
                        <div className="space-y-1.5 bg-white border border-gray-200 rounded-xl p-3">
                          {CARGOS_PPE_PADRAO.map((cargo) => (
                            <label
                              key={cargo.id}
                              className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-xs text-gray-700 select-none min-h-[36px]"
                            >
                              <input
                                type="checkbox"
                                checked={ppeCargoSelect.includes(cargo.id)}
                                onChange={() => handleTogglePpeCargo(cargo.id)}
                                className="mt-0.5 rounded border-gray-300 text-[#0e4a5a] focus:ring-[#00d4e0] cursor-pointer"
                              />
                              <span className="leading-tight">{cargo.text}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Fixo */}
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 rounded-b-2xl">
            <div className="text-xs text-gray-500 text-center sm:text-left">
              {activeTab === 'cliente' && <span>Dados cadastrais e endereço do proponente.</span>}
              {activeTab === 'proposta' && <span>Plano, prêmio, descontos e vigência da apólice.</span>}
              {activeTab === 'escritorio' && <span>Inscrição de classe, associação a escritório e especialidades.</span>}
              {activeTab === 'risco' && <span>Questionário de underwriting, renovação e declarações PPE.</span>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || regerandoMinuta}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>

              {hasContratoGerado && (
                <button
                  type="button"
                  onClick={() => salvarDados(true)}
                  disabled={saving || regerandoMinuta}
                  className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-teal-600 to-[#0e4a5a] text-white hover:from-teal-700 hover:to-[#072a33] text-sm font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                  title="Salva as alterações e gera uma nova minuta ZapSign atualizada"
                >
                  {regerandoMinuta ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#00d4e0]" />
                      <span>Regerando Minuta...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#00d4e0]" />
                      <span>Salvar &amp; Regerar Minuta</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={saving || regerandoMinuta}
                className="w-full sm:w-auto px-6 py-2.5 min-h-[44px] rounded-xl bg-[#0e4a5a] text-white hover:bg-[#072a33] text-sm font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#00d4e0]" />
                    <span>Salvando Alterações...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-[#00d4e0]" />
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
