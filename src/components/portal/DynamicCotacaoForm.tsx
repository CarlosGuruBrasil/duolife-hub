'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  ShieldCheck, 
  FileText, 
  CreditCard, 
  DollarSign, 
  Percent,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  Search,
  Copy,
  Tag,
  SlidersHorizontal,
  X,
  Building2,
  HelpCircle,
  UserCheck
} from 'lucide-react';
import { parseAtuacaoList } from '@/lib/atuacao';
import { sanitizePlanFinancials } from '@/lib/format';
import ClienteSearchSelector, { type ClienteBuscaResult, type RenewalData } from '@/components/portal/ClienteSearchSelector';
import DescontoDrawer from '@/components/portal/DescontoDrawer';
import { EnviarPropostaEmailButton } from '@/components/cotacao/EnviarPropostaEmailButton';
import { toast } from '@/components/ui/toast';
import {
  getRamoConfig,
  rcAdvogadosConfig,
  CARGOS_PPE_PADRAO,
  type RamoConfig,
  type PlanoDefinition,
  type CargoPPE,
} from '@/lib/product-schemas';
import {
  BRAZILIAN_UFS,
  maskCpfCnpj,
  maskPhone,
  maskCep,
  formatCurrencyBRL,
  parseCurrencyToNumber,
} from '@/components/modals/masks';

export interface Plano {
  tipoDePlano: string;
  nomeExibido: string;
  cobertura: string;
  franquia: string;
  ordem: number;
  parcela: string;
  parcela2X?: string;
  parcela3X?: string;
  parcela4X?: string;
  parcela5X?: string;
  parcela6X?: string;
  valorPagoKovr?: number;
  planoFranquia?: string;
}

export interface DynamicCotacaoFormProps {
  adminSelectedPartnerId?: string;
  publicToken?: string;
  productId?: string;
  initialCotacaoId?: string;
  initialCpf?: string;
  initialRenovacao?: boolean;
  ramoConfigOverride?: RamoConfig;
  initialDiscountPercent?: number;
}

export interface DynamicFormState {
  // Passo 2: Dados Básicos do Proponente / Segurado
  nome: string;
  cpfCnpj: string;
  email: string;
  celular: string;
  dataNascto: string;
  dataAtividade: string;

  // Registro Profissional e de Classe Dinâmico
  registroProfissionalNumero: string;
  registroProfissionalUf: string;
  rqe: string;
  oab: string;
  crm: string;
  crmUf: string;
  cro: string;
  croUf: string;
  creaCau: string;
  creaCauUf: string;
  crc: string;
  crcUf: string;

  // D&O / Tomadora PJ
  razaoSocialTomadora: string;
  cnpjTomadora: string;
  ativoTotal: string;
  faturamentoAnual: string;

  // Endereço de Contato / Comercial
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;

  // Passo 3: Perfil Profissional, Áreas de Atuação e Faturamento
  faturamentoAntes: string;
  faturamentoDepois: string;
  especialidades: string[];
  atuacao: string[]; // Compatibilidade retroativa

  // Pessoa Politicamente Exposta (PPE)
  ppeCargos: 'Sim' | 'Não' | string;
  ppeRepresenta: 'Sim' | 'Não' | string;
  ppeCargoSelect: string[];

  // Vigência e Renovação
  isRenovacao: 'Sim' | 'Não' | string;
  dataInicioVigencia: string;

  // Dados de Seguro Anterior (Condicional se isRenovacao === 'Sim')
  seguradora: string;
  vigencia: string;
  limite: string;
  franquiaAnterior: string;
  premio: string;
  dataRetroativa: string;

  // Questionário de Risco (Declarações & Underwriting)
  propostaRecusada: 'Sim' | 'Não' | string;
  propostaDetalhe: string;
  reclamacaoProfissional: 'Sim' | 'Não' | string;
  reclamacaoDetalhe: string;
  investigacaoAutoridade: 'Sim' | 'Não' | string;
  investigacaoDetalhe: string;
  fatoTerceiros: 'Sim' | 'Não' | string;
  fatoDetalhe: string;
  pagouReclamacao: 'Sim' | 'Não' | string;
  pagouDetalhe: string;

  // Suporte flexível para perguntas declarativas adicionais de underwriting do ramo
  [key: string]: any;
}

const initialFormState: DynamicFormState = {
  nome: '',
  cpfCnpj: '',
  email: '',
  celular: '',
  dataNascto: '',
  dataAtividade: '',
  registroProfissionalNumero: '',
  registroProfissionalUf: 'SP',
  rqe: '',
  oab: '',
  crm: '',
  crmUf: 'SP',
  cro: '',
  croUf: 'SP',
  creaCau: '',
  creaCauUf: 'SP',
  crc: '',
  crcUf: 'SP',
  razaoSocialTomadora: '',
  cnpjTomadora: '',
  ativoTotal: '',
  faturamentoAnual: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: 'SP',
  faturamentoAntes: '',
  faturamentoDepois: '',
  especialidades: [],
  atuacao: [],
  ppeCargos: 'Não',
  ppeRepresenta: 'Não',
  ppeCargoSelect: [],
  isRenovacao: 'Não',
  dataInicioVigencia: '',
  seguradora: '',
  vigencia: '',
  limite: '',
  franquiaAnterior: '',
  premio: '',
  dataRetroativa: '',
  propostaRecusada: 'Não',
  propostaDetalhe: '',
  reclamacaoProfissional: 'Não',
  reclamacaoDetalhe: '',
  investigacaoAutoridade: 'Não',
  investigacaoDetalhe: '',
  fatoTerceiros: 'Não',
  fatoDetalhe: '',
  pagouReclamacao: 'Não',
  pagouDetalhe: '',
};

function formatMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const val = Number(digits) / 100;
  return formatCurrencyBRL(val);
}

function parseMoneyToFloat(val?: string | number | null): number {
  return parseCurrencyToNumber(val, 0);
}

function formatDateDisplay(dStr: string): string {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dStr;
}

/**
 * Rola suavemente para o topo do formulário / página ao mudar de etapa.
 * Suporta contêineres com rolagem interna (PortalShell e AdminShell com overflow-y-auto)
 * e também rolagem padrão de janela (Window / Document na jornada pública de contratação).
 */
function scrollToFormTop(targetElement?: HTMLElement | null) {
  if (typeof window === 'undefined') return;

  // 1. Rola contêineres ancestrais que possuem rolagem vertical própria
  let current: HTMLElement | null = targetElement?.parentElement || null;
  while (current && current !== document.body && current !== document.documentElement) {
    try {
      const style = window.getComputedStyle(current);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      current.scrollTop = 0;
    }
    current = current.parentElement;
  }

  // 2. Rola a janela global e elementos raiz
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    window.scrollTo(0, 0);
  }

  try {
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    document.documentElement.scrollTop = 0;
  }

  try {
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    document.body.scrollTop = 0;
  }

  // 3. Fallback complementar via scrollIntoView
  if (targetElement && typeof targetElement.scrollIntoView === 'function') {
    try {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      targetElement.scrollIntoView(true);
    }
  }
}

export default function DynamicCotacaoForm({
  adminSelectedPartnerId,
  publicToken,
  productId,
  initialCotacaoId,
  initialCpf,
  initialRenovacao,
  ramoConfigOverride,
  initialDiscountPercent,
}: DynamicCotacaoFormProps) {
  const router = useRouter();
  const isClientRegistration = Boolean(publicToken);
  const effectiveInitialCpf = isClientRegistration ? undefined : initialCpf;
  const effectiveInitialRenovacao = isClientRegistration ? false : initialRenovacao;

  // Estado do Ramo Configurado
  const [resolvedRamoConfig, setResolvedRamoConfig] = useState<RamoConfig>(() => {
    if (ramoConfigOverride) return ramoConfigOverride;
    const resolved = getRamoConfig(productId || 'prod-rc-001');
    return resolved || rcAdvogadosConfig;
  });

  // Atualiza ramoConfig se a override mudar
  useEffect(() => {
    if (ramoConfigOverride) {
      setResolvedRamoConfig(ramoConfigOverride);
    }
  }, [ramoConfigOverride]);

  // Estado do Fluxo de 6 Passos
  const [step, setStep] = useState<number>(1);
  const formTopRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef<number>(1);

  // Scroll up automático a cada transição de etapa
  useEffect(() => {
    if (prevStepRef.current !== step) {
      prevStepRef.current = step;
      const timer = setTimeout(() => {
        scrollToFormTop(formTopRef.current);
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const [form, setForm] = useState<DynamicFormState>(initialFormState);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [cargosPpe, setCargosPpe] = useState<CargoPPE[]>(CARGOS_PPE_PADRAO);
  const [planoSel, setPlanoSel] = useState<Plano | null>(null);
  const [parcelaSel, setParcelaSel] = useState<{ qtd: number; valor: number } | null>(null);

  // Helper reativo para identificar plano 100k simplificado
  const isPlano100k = useMemo(() => {
    if (!planoSel) return false;
    const tipo = String(planoSel.tipoDePlano || '').toLowerCase();
    const cob = String(planoSel.cobertura || '');
    return tipo === '100k' || tipo === '100' || cob.includes('100.000');
  }, [planoSel]);

  // Estados e referências para busca automática de CEP (Aba Segurado)
  const [loadingCep, setLoadingCep] = useState<boolean>(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'success' | 'not_found' | 'error'>('idle');
  const lastSearchedCepRef = useRef<string>('');
  const numeroInputRef = useRef<HTMLInputElement>(null);

  // Cupons & Desconto Comercial
  const [cupomCode, setCupomCode] = useState('');
  const [cupomDesconto, setCupomDesconto] = useState(0);
  const [cupomAplicado, setCupomAplicado] = useState(false);
  const [cupomError, setCupomError] = useState('');

  // Desconto Comercial (Teto de 40%)
  const [descontoPercentual, setDescontoPercentual] = useState<number>(() =>
    Math.min(40, Math.max(0, initialDiscountPercent || 0))
  );
  const [isDescontoDrawerOpen, setIsDescontoDrawerOpen] = useState<boolean>(false);
  const [commissionRate, setCommissionRate] = useState<number>(20);

  // Status de Processos e Loading
  const [loading, setLoading] = useState(false);
  const [loadingPlanos, setLoadingPlanos] = useState(true);
  const [cotacaoId, setCotacaoId] = useState('');

  const setError = useCallback((msg: string) => {
    if (msg) toast.error(msg);
  }, []);

  const setSuccess = useCallback((msg: string) => {
    if (msg) toast.success(msg);
  }, []);

  // ZapSign & Asaas links
  const [signUrl, setSignUrl] = useState('');
  const [copiedSignUrl, setCopiedSignUrl] = useState(false);
  const [docToken, setDocToken] = useState('');
  const [contratoAssinado, setContratoAssinado] = useState(false);
  const [verificandoAssinatura, setVerificandoAssinatura] = useState(false);
  const [linkPagamento, setLinkPagamento] = useState('');
  const [copiedPaymentUrl, setCopiedPaymentUrl] = useState(false);
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [checkoutId, setCheckoutId] = useState('');
  const [paymentBlockedReason, setPaymentBlockedReason] = useState<string | null>(null);

  // Cliente pesquisado e renovação
  const [selectedCliente, setSelectedCliente] = useState<ClienteBuscaResult | null>(null);
  const [isRenovacaoAtiva, setIsRenovacaoAtiva] = useState(false);

  // Helper para headers públicos
  const getHeaders = useCallback(
    (baseHeaders: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...baseHeaders };
      if (publicToken) {
        headers['x-public-token'] = publicToken;
      }
      return headers;
    },
    [publicToken]
  );

  // ------------------------------------------------------------------
  // 1. Carregamento Dinâmico de Planos e Configuração de Ramo
  // ------------------------------------------------------------------
  const loadPlanos = useCallback(async () => {
    setLoadingPlanos(true);
    try {
      const queryParams = new URLSearchParams();
      if (adminSelectedPartnerId) queryParams.set('partnerId', adminSelectedPartnerId);
      if (productId) queryParams.set('productId', productId);
      const partnerQuery = queryParams.toString() ? `?${queryParams.toString()}` : '';

      const res = await fetch(`/api/portal/planos${partnerQuery}`, {
        headers: getHeaders(),
      });
      const data = await res.json();

      if (data.ok) {
        // Se a API retornou metadados do ramo (flowKey, code, category) e não houver override explícito
        if (!ramoConfigOverride && (data.flowKey || data.code || data.category)) {
          const configFromApi = getRamoConfig({
            flowKey: data.flowKey,
            code: data.code,
            category: data.category,
          });
          if (configFromApi) {
            setResolvedRamoConfig(configFromApi);
          }
        }

        if (data.commissionRate != null) {
          setCommissionRate(Number(data.commissionRate) || 20);
        }

        if (data.discountPercent != null && publicToken) {
          setDescontoPercentual(Math.min(40, Math.max(0, Number(data.discountPercent) || 0)));
        }

        if (Array.isArray(data.planos) && data.planos.length > 0) {
          const planosCorrigidos = (data.planos as Plano[]).map((p) => ({
            ...p,
            nomeExibido: p.nomeExibido?.replace('Millhões', 'Milhões'),
          }));
          setPlanos(planosCorrigidos);
          setPlanoSel((current) => {
            if (!current) return null;
            const fullPlano = planosCorrigidos.find((p) => p.tipoDePlano === current.tipoDePlano);
            return fullPlano ? { ...fullPlano, ...current } : current;
          });
          return;
        }
      }

      // Fallback: planos do ramoConfig
      if (resolvedRamoConfig && Array.isArray(resolvedRamoConfig.planos) && resolvedRamoConfig.planos.length > 0) {
        setPlanos(resolvedRamoConfig.planos as Plano[]);
      } else {
        setPlanos(rcAdvogadosConfig.planos as Plano[]);
      }
    } catch (err) {
      console.error('Erro ao buscar planos da API, usando fallback do ramo:', err);
      if (resolvedRamoConfig && Array.isArray(resolvedRamoConfig.planos) && resolvedRamoConfig.planos.length > 0) {
        setPlanos(resolvedRamoConfig.planos as Plano[]);
      } else {
        setPlanos(rcAdvogadosConfig.planos as Plano[]);
      }
    } finally {
      setLoadingPlanos(false);
    }
  }, [adminSelectedPartnerId, productId, getHeaders, ramoConfigOverride, resolvedRamoConfig]);

  useEffect(() => {
    loadPlanos();
  }, [loadPlanos]);

  // Carrega cargos PPE do sistema
  useEffect(() => {
    async function loadCargosPpe() {
      try {
        const res = await fetch('/api/portal/ppe-cargos', {
          headers: getHeaders(),
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.cargos) && data.cargos.length > 0) {
          setCargosPpe(data.cargos as CargoPPE[]);
        }
      } catch (err) {
        console.warn('Usando cargos PPE padrão:', err);
      }
    }
    if (resolvedRamoConfig.hasPpe) {
      loadCargosPpe();
    }
  }, [getHeaders, resolvedRamoConfig.hasPpe]);

  // ------------------------------------------------------------------
  // 2. Continuidade de Cotação (Carrega rascunho anterior)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!initialCotacaoId) return;

    async function loadCotacao() {
      try {
        setLoading(true);
        const res = await fetch(`/api/cotacoes/${initialCotacaoId}`, {
          headers: getHeaders(),
        });
        const data = await res.json();
        if (data.ok && data.cotacao) {
          const c = data.cotacao;
          setCotacaoId(c.id);

          // Atualiza ramo se a cotação possuir flow_key
          if (!ramoConfigOverride && (c.product_flow_key || c.product_id)) {
            const configFound = getRamoConfig({
              flowKey: c.product_flow_key,
              code: c.product_id,
            });
            if (configFound) {
              setResolvedRamoConfig(configFound);
            }
          }

          const cd = typeof c.client_data === 'string'
            ? JSON.parse(c.client_data)
            : c.client_data || {};

          const toDateInput = (iso?: string | null) => {
            if (!iso) return '';
            try {
              return String(iso).split('T')[0];
            } catch {
              return '';
            }
          };

          const atuacaoArray = parseAtuacaoList(cd.atuacao || cd.especialidades);

          let ppeArray: string[] = [];
          if (Array.isArray(cd.ppeCargoSelect)) {
            ppeArray = cd.ppeCargoSelect;
          } else if (typeof cd.ppeCargoSelect === 'string' && cd.ppeCargoSelect && cd.ppeCargoSelect !== '0') {
            ppeArray = cd.ppeCargoSelect.split(',').filter(Boolean);
          }

          const regKey = resolvedRamoConfig.registroProfissional?.key || 'oab';
          const regUfKey = resolvedRamoConfig.registroProfissional?.ufKey || 'crmUf';

          setForm((prev) => ({
            ...prev,
            ...cd,
            nome: cd.nome || c.client_name || '',
            cpfCnpj: maskCpfCnpj(cd.cpf || cd.cpfCnpj || c.client_cpf_cnpj || ''),
            email: cd.email || c.client_email || '',
            celular: maskPhone(cd.celular || c.client_phone || ''),
            registroProfissionalNumero: cd.registroProfissionalNumero || cd[regKey] || cd.oab || cd.crm || cd.cro || cd.creaCau || cd.crc || '',
            registroProfissionalUf: cd.registroProfissionalUf || cd[regUfKey] || cd.crmUf || cd.croUf || cd.creaCauUf || cd.crcUf || 'SP',
            rqe: cd.rqe || '',
            oab: cd.oab || '',
            crm: cd.crm || '',
            crmUf: cd.crmUf || 'SP',
            cro: cd.cro || '',
            croUf: cd.croUf || 'SP',
            creaCau: cd.creaCau || '',
            creaCauUf: cd.creaCauUf || 'SP',
            crc: cd.crc || '',
            crcUf: cd.crcUf || 'SP',
            razaoSocialTomadora: cd.razaoSocialTomadora || '',
            cnpjTomadora: maskCpfCnpj(cd.cnpjTomadora || ''),
            ativoTotal: cd.ativoTotal || '',
            faturamentoAnual: cd.faturamentoAnual || '',
            dataNascto: toDateInput(cd.dataNascto),
            dataAtividade: toDateInput(cd.dataAtividade),
            cep: maskCep(cd.cep || ''),
            logradouro: cd.logradouro || '',
            numero: cd.numero || '',
            complemento: cd.complemento || '',
            bairro: cd.bairro || '',
            cidade: cd.cidade || '',
            uf: cd.uf || 'SP',
            faturamentoAntes: cd.faturamentoAntes || '',
            faturamentoDepois: cd.faturamentoDepois || '',
            especialidades: atuacaoArray,
            atuacao: atuacaoArray,
            ppeCargos: cd.ppeCargos === 'Sim' || cd.ppeCargos === true ? 'Sim' : 'Não',
            ppeRepresenta: cd.ppeRepresenta === 'Sim' || cd.ppeRepresenta === true ? 'Sim' : 'Não',
            ppeCargoSelect: ppeArray,
            isRenovacao: cd.renovacao || cd.isRenovacao === 'Sim' ? 'Sim' : 'Não',
            dataInicioVigencia: toDateInput(cd.dataInicioVigencia || cd.vigencia || cd.dataVigencia),
            seguradora: cd.seguradora || '',
            vigencia: toDateInput(cd.vigencia),
            limite: cd.limite || '',
            franquiaAnterior: cd.franquiaAnterior || '',
            premio: cd.premio || '',
            dataRetroativa: toDateInput(cd.dataRetroativa),
          }));

          if (cd.cupomCodigo) {
            setCupomCode(cd.cupomCodigo);
            setCupomAplicado(true);
            setCupomDesconto(Number(cd.cupomDesconto) || 0);
          }

          if (cd.descontoManualPercent != null || cd.descontoPercentual != null) {
            const desc = Number(cd.descontoManualPercent ?? cd.descontoPercentual) || 0;
            setDescontoPercentual(Math.min(40, Math.max(0, desc)));
          }

          if (cd.tipo) {
            const planoEncontrado = planos.find((p) => p.tipoDePlano === cd.tipo);
            if (planoEncontrado) {
              setPlanoSel(planoEncontrado);
            } else {
              const { cobertura: sanitizedCob } = sanitizePlanFinancials({
                planoNome: cd.nomePlano || cd.tipo,
                cobertura: cd.valorCobertura || c.importancia_segurada,
              });
              const cobDisplay = sanitizedCob > 0
                ? formatCurrencyBRL(sanitizedCob)
                : (cd.valorCobertura || (c.importancia_segurada ? formatCurrencyBRL(c.importancia_segurada) : 'R$ 100.000,00'));

              setPlanoSel({
                tipoDePlano: cd.tipo,
                nomeExibido: cd.nomePlano || cd.tipo,
                cobertura: cobDisplay,
                franquia: cd.planoFranquia || 'R$ 1.000,00',
                ordem: 1,
                parcela: String(cd.valor || '0'),
                parcela2X: cd.parcela2X,
                parcela3X: cd.parcela3X,
                parcela4X: cd.parcela4X,
                parcela5X: cd.parcela5X,
                parcela6X: cd.parcela6X,
                valorPagoKovr: 0,
              });
            }
          }

          if (cd.parcela) {
            setParcelaSel({
              qtd: Number(cd.parcela) || 1,
              valor: Number(cd.valorParcela) || Number(cd.valor) || 0,
            });
          }

          if (cd.signUrl) setSignUrl(cd.signUrl);
          if (cd.contratoToken) setDocToken(cd.contratoToken);
          if (['assinado', 'pagamento_gerado', 'aprovada'].includes(c.status)) {
            setContratoAssinado(true);
          }
          if (cd.linkBoleto) {
            setLinkPagamento(cd.linkBoleto);
            setPaymentDueDate(cd.dataVencimento || '');
            setCheckoutId(cd.checkoutId || '');
          }

          // Posicionamento inteligente de esteira
          if (c.status === 'contrato_gerado' && cd.signUrl) {
            setStep(6);
          } else if (c.status === 'pagamento_gerado' && cd.linkBoleto) {
            setStep(6);
          } else if (cd.tipo) {
            setStep(5);
          } else if (cd.logradouro && (cd.cpf || c.client_cpf_cnpj)) {
            setStep(3);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar continuidade da cotação:', err);
        setError('Não foi possível carregar os dados prévios da cotação.');
      } finally {
        setLoading(false);
      }
    }

    loadCotacao();
  }, [initialCotacaoId, getHeaders, planos, ramoConfigOverride, resolvedRamoConfig.registroProfissional]);

  // Atualizador de campo genérico
  function updateField(field: keyof DynamicFormState | string, value: any) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  // ------------------------------------------------------------------
  // 3. Integração com ClienteSearchSelector e ViaCEP
  // ------------------------------------------------------------------
  function handleSelectCliente(cliente: ClienteBuscaResult) {
    setSelectedCliente(cliente);
    setIsRenovacaoAtiva(false);

    const regKey = resolvedRamoConfig.registroProfissional?.key || 'oab';
    const regVal = (cliente as any)[regKey] || cliente.oab || '';

    setForm((prev) => ({
      ...prev,
      nome: cliente.fullName || prev.nome,
      cpfCnpj: cliente.documentFormatted || maskCpfCnpj(cliente.documentNumber) || prev.cpfCnpj,
      email: cliente.email || prev.email,
      celular: cliente.phone ? maskPhone(cliente.phone) : prev.celular,
      registroProfissionalNumero: regVal || prev.registroProfissionalNumero,
      [regKey]: regVal || (prev as any)[regKey],
      oab: cliente.oab || prev.oab,
      dataNascto: cliente.birthDate || prev.dataNascto,
      dataAtividade: cliente.dataAtividade || prev.dataAtividade,
      cep: cliente.address?.cep ? maskCep(cliente.address.cep) : prev.cep,
      logradouro: cliente.address?.logradouro || prev.logradouro,
      numero: cliente.address?.numero || prev.numero,
      complemento: cliente.address?.complemento || prev.complemento,
      bairro: cliente.address?.bairro || prev.bairro,
      cidade: cliente.address?.cidade || prev.cidade,
      uf: cliente.address?.uf || prev.uf,
    }));
    if (cliente.address?.cep) {
      lastSearchedCepRef.current = cliente.address.cep.replace(/\D/g, '');
      setCepStatus('success');
    }
  }

  function handleApplyRenewal(renewal: RenewalData) {
    setIsRenovacaoAtiva(true);
    setForm((prev) => ({
      ...prev,
      isRenovacao: 'Sim',
      dataInicioVigencia: renewal.dataInicioVigenciaSugerida || prev.dataInicioVigencia,
      seguradora: renewal.seguradora || prev.seguradora,
      vigencia: renewal.vigenciaAnterior || prev.vigencia,
      limite: renewal.limite || prev.limite,
      franquiaAnterior: renewal.franquia || prev.franquiaAnterior,
      premio: renewal.premio || prev.premio,
      dataRetroativa: renewal.dataRetroativa || prev.dataRetroativa,
      faturamentoAntes: renewal.faturamentoAntes ? formatMoneyInput(renewal.faturamentoAntes) : prev.faturamentoAntes,
      faturamentoDepois: renewal.faturamentoDepois ? formatMoneyInput(renewal.faturamentoDepois) : prev.faturamentoDepois,
      especialidades: renewal.atuacao && renewal.atuacao.length > 0 ? renewal.atuacao : prev.especialidades,
      atuacao: renewal.atuacao && renewal.atuacao.length > 0 ? renewal.atuacao : prev.atuacao,
      ppeCargos: renewal.ppeCargos || prev.ppeCargos,
      ppeRepresenta: renewal.ppeRepresenta || prev.ppeRepresenta,
      ppeCargoSelect: renewal.ppeCargoSelect && renewal.ppeCargoSelect.length > 0 ? renewal.ppeCargoSelect : prev.ppeCargoSelect,
    }));
  }

  function handleClearClienteSelection() {
    setSelectedCliente(null);
    setIsRenovacaoAtiva(false);
    lastSearchedCepRef.current = '';
    setCepStatus('idle');
  }

  async function handleCepSearch(cepVal: string, force = false) {
    const rawCep = cepVal.replace(/\D/g, '');
    if (rawCep.length !== 8) {
      setCepStatus('idle');
      return;
    }

    if (!force && lastSearchedCepRef.current === rawCep) {
      return;
    }

    lastSearchedCepRef.current = rawCep;
    setLoadingCep(true);
    setCepStatus('loading');

    try {
      // 1. Consulta à rota de alta disponibilidade da aplicação (/api/cep/[cep])
      let endereco: {
        logradouro?: string;
        bairro?: string;
        cidade?: string;
        uf?: string;
      } | null = null;

      try {
        const res = await fetch(`/api/cep/${rawCep}`);
        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.endereco) {
            endereco = json.endereco;
          }
        }
      } catch (errApi) {
        console.warn('API interna de CEP indisponível, tentando fallback direto:', errApi);
      }

      // 2. Fallback client-side direto para ViaCEP se a API interna falhar
      if (!endereco) {
        try {
          const resViaCep = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
          if (resViaCep.ok) {
            const dataVia = await resViaCep.json();
            if (!dataVia.erro) {
              endereco = {
                logradouro: dataVia.logradouro,
                bairro: dataVia.bairro,
                cidade: dataVia.localidade,
                uf: dataVia.uf,
              };
            }
          }
        } catch {
          // Falha de rede/CORS no fallback
        }
      }

      if (endereco) {
        setForm((current) => ({
          ...current,
          cep: maskCep(cepVal),
          logradouro: endereco!.logradouro || current.logradouro,
          bairro: endereco!.bairro || current.bairro,
          cidade: endereco!.cidade || current.cidade,
          uf: (endereco!.uf || current.uf).toUpperCase(),
        }));
        setCepStatus('success');

        // Move suavemente o foco para o campo de número
        setTimeout(() => {
          numeroInputRef.current?.focus();
        }, 80);
      } else {
        setCepStatus('not_found');
      }
    } catch (err) {
      console.warn('Erro ao consultar CEP:', err);
      setCepStatus('error');
    } finally {
      setLoadingCep(false);
    }
  }

  // ------------------------------------------------------------------
  // 4. Cupom e Cálculo de Parcelamento Dinâmico
  // ------------------------------------------------------------------
  async function handleValidarCupom() {
    setCupomError('');
    setCupomDesconto(0);
    setCupomAplicado(false);

    if (!cupomCode.trim()) return;

    try {
      const res = await fetch('/api/portal/validar-cupom', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ code: cupomCode.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCupomDesconto(Number(data.desconto) || 0);
        setCupomAplicado(true);
      } else {
        setCupomError(data.error || 'Cupom inválido ou expirado');
      }
    } catch {
      setCupomError('Erro de conexão ao validar cupom.');
    }
  }

  const getOpcoesParcelamento = useCallback(
    (plano: Plano) => {
      const valorOriginal = parseMoneyToFloat(plano.parcela);
      const maiorDesconto = Math.max(descontoPercentual, cupomDesconto);
      const fatorDesconto = 1 - maiorDesconto / 100;
      const valorComDesconto = Math.round(valorOriginal * fatorDesconto * 100) / 100;

      const parseParcela = (parcStr?: string) => {
        if (!parcStr) return 0;
        return Math.round(parseMoneyToFloat(parcStr) * fatorDesconto * 100) / 100;
      };

      const opcoes = [
        { qtd: 1, valor: valorComDesconto },
        { qtd: 2, valor: parseParcela(plano.parcela2X) || Math.round((valorComDesconto / 2) * 100) / 100 },
        { qtd: 3, valor: parseParcela(plano.parcela3X) || Math.round((valorComDesconto / 3) * 100) / 100 },
        { qtd: 4, valor: parseParcela(plano.parcela4X) || Math.round((valorComDesconto / 4) * 100) / 100 },
        { qtd: 6, valor: parseParcela(plano.parcela6X) || Math.round((valorComDesconto / 6) * 100) / 100 },
      ];

      // Plano 100k somente permite 1x (à vista)
      if (String(plano.tipoDePlano || '').toLowerCase() === '100k') {
        return [opcoes[0]];
      }

      const validKeys: (keyof Plano)[] = ['parcela', 'parcela2X', 'parcela3X', 'parcela4X', 'parcela6X'];
      return opcoes.filter((op, i) => {
        const key = validKeys[i];
        return plano[key] && plano[key] !== '' && plano[key] !== 'R$ 0,00';
      });
    },
    [descontoPercentual, cupomDesconto]
  );

  // ------------------------------------------------------------------
  // 5. Navegação e Validação dos Passos
  // ------------------------------------------------------------------
  function handleNext() {
    setError('');

    // Passo 1: Seleção de Plano
    if (step === 1) {
      if (!planoSel) {
        setError('Por favor, selecione um plano e limite de cobertura antes de avançar.');
        return;
      }
    }

    // Passo 2: Dados do Segurado / Tomadora
    if (step === 2) {
      const isDo = !resolvedRamoConfig.registroProfissional;

      if (isDo) {
        if (!form.razaoSocialTomadora || !form.cnpjTomadora) {
          setError('Informe a Razão Social e o CNPJ da Sociedade Tomadora.');
          return;
        }
      } else {
        const regConfig = resolvedRamoConfig.registroProfissional;
        const regVal = form.registroProfissionalNumero || (form as any)[regConfig?.key || ''];
        if (regConfig?.required && !regVal) {
          setError(`Preencha o campo obrigatório de ${regConfig.label}.`);
          return;
        }
      }

      if (!form.nome || !form.cpfCnpj || !form.email || !form.celular) {
        setError('Preencha todos os dados pessoais obrigatórios (Nome, CPF/CNPJ, E-mail, Celular).');
        return;
      }

      if (!form.dataNascto || !form.dataAtividade) {
        setError('Preencha a data de nascimento e o início da atividade profissional.');
        return;
      }

      if (!form.cep || !form.logradouro || !form.numero || !form.bairro || !form.cidade || !form.uf) {
        setError('Preencha os campos obrigatórios do endereço comercial / residencial.');
        return;
      }
    }

    // Passo 3: Perfil e Atuação
    if (step === 3) {
      if (!isPlano100k) {
        if (resolvedRamoConfig.hasFaturamento) {
          if (!form.faturamentoAntes || !form.faturamentoDepois) {
            setError('Informe o faturamento bruto anual dos períodos indicados.');
            return;
          }
        }

        if (resolvedRamoConfig.especialidades && resolvedRamoConfig.especialidades.length > 0) {
          if (form.especialidades.length === 0) {
            setError('Selecione ao menos uma especialidade ou área de atuação.');
            return;
          }
        }

        if (resolvedRamoConfig.hasPpe && form.ppeCargos === 'Sim' && form.ppeCargoSelect.length === 0) {
          setError('Selecione ao menos uma das funções públicas listadas para PPE.');
          return;
        }
      }
    }

    // Passo 4: Declarações & Underwriting
    if (step === 4) {
      if (form.isRenovacao === 'Sim') {
        if (!form.seguradora || !form.vigencia || !form.limite || !form.dataRetroativa) {
          setError('Preencha todas as informações do seguro anterior para a renovação.');
          return;
        }
      }

      // Validação do questionário dinâmico do ramo
      if (!isPlano100k && resolvedRamoConfig.requiresUnderwriting !== false) {
        for (const item of resolvedRamoConfig.questionarioRisco) {
          const resp = form[item.id] || 'Não';
          if (resp === 'Sim') {
            const detalhe = form[item.detailKey];
            if (!detalhe || !detalhe.trim()) {
              setError(`Justificativa obrigatória: forneça os detalhes para a pergunta "${item.question.slice(0, 60)}...".`);
              return;
            }
          }
        }
      }
    }

    setStep((prev) => Math.min(6, prev + 1));
    scrollToFormTop(formTopRef.current);
  }

  function handleBack() {
    setError('');
    setStep((prev) => Math.max(1, prev - 1));
    scrollToFormTop(formTopRef.current);
  }

  // ------------------------------------------------------------------
  // 6. Passo 5: Geração de Contrato (ZapSign) & Cotação no Backend
  // ------------------------------------------------------------------
  async function handleGerarContrato() {
    if (!planoSel || !parcelaSel) {
      setError('Selecione a cobertura e a condição de parcelamento.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const maiorDesconto = Math.max(descontoPercentual, cupomDesconto);
      const valorTotal = Math.round(parseMoneyToFloat(planoSel.parcela) * (1 - maiorDesconto / 100) * 100) / 100;
      const valorParcela = parcelaSel.valor;

      const formatDateForIso = (dateStr: string) => {
        if (!dateStr) return null;
        try {
          const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T15:00:00Z');
          if (isNaN(d.getTime())) return null;
          return d.toISOString();
        } catch {
          return null;
        }
      };

      const regKey = resolvedRamoConfig.registroProfissional?.key || 'oab';
      const regUfKey = resolvedRamoConfig.registroProfissional?.ufKey || 'crmUf';
      const regNumero = form.registroProfissionalNumero || (form as any)[regKey] || form.oab || '';
      const regUf = form.registroProfissionalUf || (form as any)[regUfKey] || form.crmUf || 'SP';

      const payloadClientData: Record<string, any> = {
        ...form,
        cpf: form.cpfCnpj.replace(/\D/g, ''),
        dataNascto: formatDateForIso(form.dataNascto),
        dataAtividade: formatDateForIso(form.dataAtividade),
        dataInicioVigencia: form.dataInicioVigencia ? formatDateForIso(form.dataInicioVigencia) : null,
        vigencia: form.vigencia ? formatDateForIso(form.vigencia) : (form.dataInicioVigencia ? formatDateForIso(form.dataInicioVigencia) : null),
        dataRetroativa: form.dataRetroativa ? formatDateForIso(form.dataRetroativa) : null,
        renovacao: form.isRenovacao === 'Sim',
        isRenovacao: form.isRenovacao,
        // Especialidades & Atuação unificadas
        especialidades: form.especialidades,
        atuacao: form.especialidades.length > 0 ? form.especialidades.join(':') : (form.atuacao.length > 0 ? form.atuacao.join(':') : ''),
        ppeCargoSelect: form.ppeCargoSelect.length > 0 ? form.ppeCargoSelect.join(',') : '0',
        tipo: planoSel.tipoDePlano,
        nomePlano: planoSel.nomeExibido,
        planoFranquia: planoSel.franquia,
        valor: valorTotal,
        valorParcela: valorParcela,
        parcela: parcelaSel.qtd,
        descontoManualPercent: descontoPercentual,
        descontoPercentual: maiorDesconto,
        cupomCodigo: cupomAplicado ? cupomCode : null,
        cupomDesconto: cupomDesconto,
        valorCobertura: planoSel.cobertura,
        // Metadados do Ramo
        ramoId: resolvedRamoConfig.ramoId,
        ramoName: resolvedRamoConfig.name,
        policyPrefix: resolvedRamoConfig.policyPrefix,
        registroProfissionalNumero: regNumero,
        registroProfissionalUf: regUf,
        [regKey]: regNumero,
        [regUfKey]: regUf,
        rqe: form.rqe || null,
        lgpd: 1,
      };

      delete payloadClientData.cpfCnpj;
      delete payloadClientData.isRenovacao;

      const { cobertura: cleanCob } = sanitizePlanFinancials({
        planoNome: planoSel.nomeExibido || planoSel.tipoDePlano,
        cobertura: planoSel.cobertura,
        premio: valorTotal,
      });

      const payload = {
        cotacaoId: cotacaoId || undefined,
        clientName: form.nome,
        clientCpfCnpj: form.cpfCnpj.replace(/\D/g, ''),
        clientEmail: form.email,
        clientPhone: form.celular,
        productId: productId || resolvedRamoConfig.ramoId,
        importanciaSegurada: cleanCob > 0 ? cleanCob : parseMoneyToFloat(planoSel.cobertura),
        clientData: payloadClientData,
        adminSelectedPartnerId,
      };

      // 1. Salva ou atualiza a cotação
      const res = await fetch('/api/cotacoes', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao registrar cotação.');
        setLoading(false);
        return;
      }

      const id = data.cotacao.id;
      setCotacaoId(id);

      // 2. Dispara geração de contrato no ZapSign
      const zapRes = await fetch(`/api/portal/cotacoes/${id}/gerar-contrato`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const zapData = await zapRes.json();

      if (zapRes.ok && zapData.ok) {
        setSignUrl(zapData.signUrl);
        setDocToken(zapData.docToken);
        setStep(6);
        scrollToFormTop(formTopRef.current);
      } else {
        setError(zapData.error || 'Erro ao gerar o contrato no ZapSign.');
      }
    } catch {
      setError('Erro de comunicação com o servidor ao gerar contrato.');
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------------
  // 7. Passo 6: Assinatura e Fatura Asaas
  // ------------------------------------------------------------------
  async function handleCopySignUrl() {
    if (!signUrl) return;
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopiedSignUrl(true);
      setTimeout(() => setCopiedSignUrl(false), 2500);
    } catch (err) {
      console.warn('Falha ao copiar link ZapSign:', err);
    }
  }

  async function handleCopyPaymentUrl() {
    if (!linkPagamento) return;
    try {
      await navigator.clipboard.writeText(linkPagamento);
      setCopiedPaymentUrl(true);
      setTimeout(() => setCopiedPaymentUrl(false), 2500);
    } catch (err) {
      console.warn('Falha ao copiar link de pagamento:', err);
    }
  }

  async function handleVerificarAssinatura() {
    if (!cotacaoId) return;

    setVerificandoAssinatura(true);
    setError('');

    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/verificar-assinatura`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();

      if (data.ok && data.assinado) {
        setContratoAssinado(true);
        setSuccess('Contrato assinado com sucesso!');

        if (data.linkBoleto) {
          setLinkPagamento(data.linkBoleto);
          setCheckoutId(data.checkoutId || '');
          setPaymentDueDate(data.dueDate || '');
          setPaymentBlockedReason(null);
        } else if (data.paymentError) {
          setPaymentBlockedReason(data.paymentError);
        } else {
          await handleGerarPagamento();
        }
      } else {
        setError('O contrato ainda não consta como assinado no ZapSign. Finalize a assinatura no painel.');
      }
    } catch {
      setError('Erro ao verificar assinatura.');
    } finally {
      setVerificandoAssinatura(false);
    }
  }

  async function handleGerarPagamento() {
    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/gerar-pagamento`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setLinkPagamento(data.linkBoleto);
        setPaymentDueDate(data.dueDate);
        setCheckoutId(data.checkoutId);
        setPaymentBlockedReason(null);
      } else {
        const errMsg = data.error || 'Falha ao emitir a fatura no Asaas.';
        setError(errMsg);
        setPaymentBlockedReason(errMsg);
      }
    } catch {
      setError('Erro ao gerar pagamento no Asaas.');
    }
  }

  // Handlers para Seleção Múltipla
  const handleToggleEspecialidade = (key: string) => {
    const current = [...form.especialidades];
    const idx = current.indexOf(key);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(key);
    }
    setForm((prev) => ({
      ...prev,
      especialidades: current,
      atuacao: current,
    }));
  };

  const handleTogglePpe = (id: string) => {
    const current = [...form.ppeCargoSelect];
    const idx = current.indexOf(id);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(id);
    }
    updateField('ppeCargoSelect', current);
  };

  // ------------------------------------------------------------------
  // RENDERIZAÇÃO PRINCIPAL DO COMPONENTE
  // ------------------------------------------------------------------
  return (
    <div ref={formTopRef} className="max-w-4xl mx-auto scroll-mt-24">
      {/* Indicador de Passos da Esteira */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
        {[
          { num: 1, label: 'Cobertura', icon: ShieldCheck },
          { num: 2, label: resolvedRamoConfig.registroProfissional ? 'Segurado' : 'Tomadora', icon: resolvedRamoConfig.registroProfissional ? FileText : Building2 },
          { num: 3, label: 'Perfil', icon: SlidersHorizontal },
          { num: 4, label: 'Declarações', icon: AlertCircle },
          { num: 5, label: 'Pagamento', icon: DollarSign },
          { num: 6, label: 'Assinatura', icon: CreditCard },
        ].map((s) => {
          const Icon = s.icon;
          const isCurrent = step === s.num;
          const isCompleted = step > s.num;

          return (
            <div
              key={s.num}
              onClick={() => {
                if (isCompleted) {
                  setError('');
                  setStep(s.num);
                  scrollToFormTop(formTopRef.current);
                }
              }}
              className={`flex items-center space-x-2 select-none transition-all ${
                isCompleted ? 'cursor-pointer group' : ''
              }`}
              title={isCompleted ? `Voltar para a etapa ${s.num}: ${s.label}` : undefined}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                  isCurrent
                    ? 'bg-primary text-white shadow-sm ring-2 ring-primary/20'
                    : isCompleted
                    ? 'bg-emerald-600 text-white group-hover:bg-emerald-700 group-hover:scale-105 shadow-2xs'
                    : 'bg-gray-100 text-gray-400 border border-gray-200'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span
                className={`hidden md:inline text-xs font-semibold ${
                  isCurrent
                    ? 'text-primary font-bold'
                    : isCompleted
                    ? 'text-emerald-700 font-medium group-hover:underline'
                    : 'text-gray-500'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ================================================================== */}
      {/* PASSO 1: PLANOS E COBERTURAS DO RAMO                               */}
      {/* ================================================================== */}
      {step === 1 && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-primary">1. Seleção de Plano e Cobertura</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                  {resolvedRamoConfig.shortName || resolvedRamoConfig.name}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {isClientRegistration
                  ? 'Selecione o limite de indenização desejado para sua proteção.'
                  : 'Selecione o limite de indenização desejado e aplique descontos comerciais autorizados.'}
              </p>
            </div>

            {/* Controle de Desconto Comercial */}
            <div className="flex items-center space-x-2">
              {isClientRegistration ? (
                descontoPercentual > 0 && (
                  <div className="flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shadow-2xs">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800">
                      {descontoPercentual}% de desconto exclusivo já aplicado
                    </span>
                  </div>
                )
              ) : descontoPercentual > 0 ? (
                <div className="flex items-center space-x-1.5 bg-emerald-50 border border-emerald-200 pl-3 pr-1.5 py-1.5 rounded-xl shadow-2xs">
                  <span className="text-xs font-bold text-emerald-800 flex items-center space-x-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{descontoPercentual}% OFF aplicado</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsDescontoDrawerOpen(true)}
                    className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                    title="Ajustar desconto e simular comissão"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDescontoPercentual(0);
                      setParcelaSel(null);
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Remover desconto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDescontoDrawerOpen(true)}
                  className="btn btn-secondary text-xs px-3.5 py-2 flex items-center space-x-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 bg-emerald-50/40 transition-colors cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Aplicar Desconto (Até 40%)</span>
                </button>
              )}
            </div>
          </div>

          {/* Lista Dinâmica de Planos */}
          {loadingPlanos ? (
            <div className="py-12 text-center text-gray-500 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-gray-600">Carregando catálogo de coberturas...</p>
            </div>
          ) : planos.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border border-dashed border-gray-300 rounded-xl bg-gray-50">
              <p className="text-sm font-medium text-gray-700">Nenhum plano disponível no momento.</p>
              <button
                type="button"
                onClick={() => loadPlanos()}
                className="btn btn-secondary text-xs mt-3 cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {planos.map((plano) => {
                const isSelected = planoSel?.tipoDePlano === plano.tipoDePlano;
                const vOriginal = parseMoneyToFloat(plano.parcela);
                const vDescontado = Math.round(vOriginal * (1 - descontoPercentual / 100) * 100) / 100;
                const vDescontadoFormatado = formatCurrencyBRL(vDescontado);

                return (
                  <div
                    key={plano.tipoDePlano}
                    onClick={() => {
                      setPlanoSel(plano);
                      setParcelaSel(null);
                    }}
                    className={`border-2 rounded-xl p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-base text-gray-900">{plano.nomeExibido}</h4>
                        {descontoPercentual > 0 && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 tracking-tight">
                            -{descontoPercentual}%
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-2xl font-black text-emerald-600">{plano.cobertura}</div>
                      <div className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wide">
                        Limite Máximo de Indenização (LMI)
                      </div>
                    </div>

                    <div className="mt-5 border-t border-gray-100 pt-4 text-sm space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 text-xs font-medium">Franquia</span>
                        <span className="font-semibold text-gray-900">{plano.franquia}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 text-xs font-medium">Valor à vista</span>
                        {descontoPercentual > 0 ? (
                          <div className="text-right flex items-baseline justify-end">
                            <span className="line-through text-gray-400 text-xs font-medium mr-2">
                              {plano.parcela}
                            </span>
                            <span className="font-black text-emerald-600 text-base">
                              {vDescontadoFormatado}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-emerald-600">{plano.parcela}</span>
                        )}
                      </div>

                      {String(plano.tipoDePlano || '').toLowerCase() !== '100k' && (
                        <div className="text-[11px] text-gray-500 text-right font-medium">
                          ou até 6x de aprox. {formatCurrencyBRL(vDescontado / 6)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-gray-100">
            <div>
              {descontoPercentual > 0 ? (
                <div className="flex items-center space-x-2 text-xs text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  <Percent className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Desconto de <strong>{descontoPercentual}%</strong> aplicado a todos os planos.
                  </span>
                  {!isClientRegistration && (
                    <button
                      type="button"
                      onClick={() => setIsDescontoDrawerOpen(true)}
                      className="underline font-bold hover:text-emerald-950 ml-1 cursor-pointer"
                    >
                      Ver Comissão
                    </button>
                  )}
                </div>
              ) : !isClientRegistration ? (
                <span className="text-xs text-gray-500">
                  Você pode aplicar até 40% de desconto comercial nesta proposta.
                </span>
              ) : null}
            </div>

            <button
              onClick={handleNext}
              disabled={!planoSel}
              className="btn btn-primary flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PASSO 2: DADOS DO PROPONENTE / TOMADORA & ENDEREÇO                 */}
      {/* ================================================================== */}
      {step === 2 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-primary">
            2. Dados do Proponente / {resolvedRamoConfig.registroProfissional ? 'Segurado' : 'Empresa Tomadora'}
          </h3>

          {/* Seletor Inteligente de Clientes (Disponível exclusivamente para corretores/vendedores no portal ou admin) */}
          {!isClientRegistration && (
            <ClienteSearchSelector
              adminSelectedPartnerId={adminSelectedPartnerId}
              publicToken={publicToken}
              selectedCliente={selectedCliente}
              isRenovacaoAtiva={isRenovacaoAtiva}
              initialCpf={effectiveInitialCpf}
              autoApplyRenewal={effectiveInitialRenovacao}
              onSelectCliente={handleSelectCliente}
              onApplyRenewal={handleApplyRenewal}
              onClearSelection={handleClearClienteSelection}
            />
          )}

          {/* Bloco D&O: Sociedade Tomadora PJ */}
          {!resolvedRamoConfig.registroProfissional && (
            <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl space-y-4">
              <div className="flex items-center space-x-2 border-b border-gray-200 pb-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h4 className="font-bold text-sm text-gray-900">Dados da Sociedade Tomadora (Pessoa Jurídica)</h4>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="field-label">Razão Social da Tomadora *</span>
                  <input
                    required
                    value={form.razaoSocialTomadora}
                    onChange={(e) => updateField('razaoSocialTomadora', e.target.value)}
                    className="form-input"
                    placeholder="Razão social completa da empresa tomadora"
                  />
                </label>

                <label className="block">
                  <span className="field-label">CNPJ da Sociedade Tomadora *</span>
                  <input
                    required
                    value={form.cnpjTomadora}
                    onChange={(e) => updateField('cnpjTomadora', maskCpfCnpj(e.target.value))}
                    className="form-input"
                    placeholder="00.000.000/0000-00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Ativo Total da Sociedade</span>
                  <input
                    value={form.ativoTotal}
                    onChange={(e) => updateField('ativoTotal', formatMoneyInput(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                  <span className="text-[11px] text-gray-500 mt-1 block">Conforme último balanço encerrado</span>
                </label>

                <label className="block">
                  <span className="field-label">Receita Operacional Bruta Anual</span>
                  <input
                    value={form.faturamentoAnual}
                    onChange={(e) => updateField('faturamentoAnual', formatMoneyInput(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                  <span className="text-[11px] text-gray-500 mt-1 block">Faturamento bruto anual acumulado</span>
                </label>
              </div>
            </div>
          )}

          {/* Dados Pessoais do Representante / Profissional Segurado */}
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome Completo *</span>
              <input
                required
                value={form.nome}
                onChange={(e) => updateField('nome', e.target.value)}
                className="form-input"
                placeholder="Nome completo do proponente"
              />
            </label>

            <label className="block">
              <span className="field-label">CPF / CNPJ *</span>
              <input
                required
                value={form.cpfCnpj}
                onChange={(e) => updateField('cpfCnpj', maskCpfCnpj(e.target.value))}
                className="form-input"
                placeholder="000.000.000-00"
              />
            </label>

            <label className="block">
              <span className="field-label">E-mail Principal *</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="form-input"
                placeholder="exemplo@email.com"
              />
            </label>

            <label className="block">
              <span className="field-label">Celular / WhatsApp *</span>
              <input
                required
                value={form.celular}
                onChange={(e) => updateField('celular', maskPhone(e.target.value))}
                className="form-input"
                placeholder="(00) 00000-0000"
              />
            </label>

            {/* Conselho de Classe Dinâmico */}
            {resolvedRamoConfig.registroProfissional && (
              <>
                {resolvedRamoConfig.registroProfissional.ufKey ? (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block col-span-2">
                      <span className="field-label">{resolvedRamoConfig.registroProfissional.label} *</span>
                      <input
                        required={resolvedRamoConfig.registroProfissional.required}
                        value={form.registroProfissionalNumero || (form as any)[resolvedRamoConfig.registroProfissional.key] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateField('registroProfissionalNumero', val);
                          updateField(resolvedRamoConfig.registroProfissional!.key, val);
                        }}
                        className="form-input"
                        placeholder={resolvedRamoConfig.registroProfissional.placeholder}
                      />
                    </label>

                    <label className="block">
                      <span className="field-label">UF</span>
                      <select
                        value={form.registroProfissionalUf || (form as any)[resolvedRamoConfig.registroProfissional.ufKey] || 'SP'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateField('registroProfissionalUf', val);
                          updateField(resolvedRamoConfig.registroProfissional!.ufKey!, val);
                        }}
                        className="form-input"
                      >
                        {BRAZILIAN_UFS.map((uf) => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <label className="block">
                    <span className="field-label">{resolvedRamoConfig.registroProfissional.label} *</span>
                    <input
                      required={resolvedRamoConfig.registroProfissional.required}
                      value={form.registroProfissionalNumero || form.oab || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateField('registroProfissionalNumero', val);
                        updateField(resolvedRamoConfig.registroProfissional!.key, val);
                        updateField('oab', val);
                      }}
                      className="form-input"
                      placeholder={resolvedRamoConfig.registroProfissional.placeholder}
                    />
                  </label>
                )}

                {/* Campo RQE (Registro de Especialista) se aplicável (médicos) */}
                {resolvedRamoConfig.registroProfissional.hasRqe && (
                  <label className="block">
                    <span className="field-label">RQE - Registro de Qualificação de Especialista (Opcional)</span>
                    <input
                      value={form.rqe}
                      onChange={(e) => updateField('rqe', e.target.value)}
                      className="form-input"
                      placeholder="Ex: RQE 12345 (se houver especialidade registrada)"
                    />
                  </label>
                )}
              </>
            )}

            <label className="block">
              <span className="field-label">Data de Nascimento *</span>
              <input
                type="date"
                required
                value={form.dataNascto}
                onChange={(e) => updateField('dataNascto', e.target.value)}
                className="form-input"
              />
            </label>

            <label className="block">
              <span className="field-label">Início da Atividade Profissional *</span>
              <input
                type="date"
                required
                value={form.dataAtividade}
                onChange={(e) => updateField('dataAtividade', e.target.value)}
                className="form-input"
              />
            </label>
          </div>

          {/* Endereço de Contato / Comercial */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 pb-1 border-b border-gray-100">
            <h3 className="text-lg font-bold text-primary">Endereço de Contato / Comercial</h3>
            {loadingCep && (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00d4e0]" /> Buscando endereço...
              </span>
            )}
            {cepStatus === 'success' && !loadingCep && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Endereço localizado
              </span>
            )}
            {cepStatus === 'not_found' && !loadingCep && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> CEP não localizado. Preencha manualmente.
              </span>
            )}
            {cepStatus === 'error' && !loadingCep && (
              <span className="inline-flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5" /> Falha ao consultar CEP. Preencha manualmente.
              </span>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <label className="block">
              <span className="field-label">CEP *</span>
              <div className="relative">
                <input
                  required
                  value={form.cep}
                  maxLength={9}
                  onChange={(e) => {
                    const val = maskCep(e.target.value);
                    updateField('cep', val);
                    const digits = val.replace(/\D/g, '');
                    if (digits.length === 8) {
                      handleCepSearch(val);
                    } else if (digits.length < 8) {
                      setCepStatus('idle');
                    }
                  }}
                  onBlur={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    if (digits.length === 8 && lastSearchedCepRef.current !== digits) {
                      handleCepSearch(e.target.value, true);
                    }
                  }}
                  className="form-input pr-10 font-mono"
                  placeholder="00000-000"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none flex items-center">
                  {loadingCep ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#00d4e0]" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </div>
              </div>
            </label>

            <label className="block md:col-span-2">
              <span className="field-label">Logradouro / Rua *</span>
              <input
                required
                value={form.logradouro}
                onChange={(e) => updateField('logradouro', e.target.value)}
                className="form-input"
                placeholder="Avenida, Rua, Praça..."
              />
            </label>

            <label className="block">
              <span className="field-label">Número *</span>
              <input
                ref={numeroInputRef}
                required
                value={form.numero}
                onChange={(e) => updateField('numero', e.target.value)}
                className="form-input"
                placeholder="Número"
              />
            </label>

            <label className="block">
              <span className="field-label">Complemento</span>
              <input
                value={form.complemento}
                onChange={(e) => updateField('complemento', e.target.value)}
                className="form-input"
                placeholder="Ex: Sala 402"
              />
            </label>

            <label className="block">
              <span className="field-label">Bairro *</span>
              <input
                required
                value={form.bairro}
                onChange={(e) => updateField('bairro', e.target.value)}
                className="form-input"
                placeholder="Bairro"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="field-label">Cidade *</span>
              <input
                required
                value={form.cidade}
                onChange={(e) => updateField('cidade', e.target.value)}
                className="form-input"
                placeholder="Cidade"
              />
            </label>

            <label className="block">
              <span className="field-label">UF *</span>
              <select
                value={form.uf}
                onChange={(e) => updateField('uf', e.target.value)}
                className="form-input"
              >
                {BRAZILIAN_UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2 cursor-pointer"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PASSO 3: PERFIL & ATUAÇÃO DINÂMICA DO RAMO                         */}
      {/* ================================================================== */}
      {step === 3 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-primary">3. Renovação & Perfil de Atuação</h3>

          {/* Vigência e Renovação */}
          <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl mb-4 grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label text-gray-900">É uma renovação de apólice anterior?</span>
              <select
                value={form.isRenovacao}
                onChange={(e) => {
                  const val = e.target.value;
                  updateField('isRenovacao', val);
                  if (val === 'Não') {
                    setIsRenovacaoAtiva(false);
                  } else if (selectedCliente?.renewalData?.hasPreviousPolicy) {
                    setIsRenovacaoAtiva(true);
                  }
                }}
                className="form-input mt-2"
              >
                <option value="Não">Não (Novo Seguro)</option>
                <option value="Sim">Sim (Renovação de seguro anterior)</option>
              </select>
            </label>

            <label className="block">
              <span className="field-label text-gray-900">Data de Início da Vigência</span>
              <input
                type="date"
                required
                value={form.dataInicioVigencia}
                onChange={(e) => {
                  updateField('dataInicioVigencia', e.target.value);
                  if (form.isRenovacao === 'Sim' && !form.vigencia) {
                    updateField('vigencia', e.target.value);
                  }
                }}
                className="form-input mt-2"
              />
              <span className="text-[11px] text-gray-500 mt-1 block font-normal">
                Data a partir da qual o contrato e coberturas passarão a vigorar.
              </span>
            </label>
          </div>

          {/* Card Informativo de Perfil Simplificado no Plano 100k */}
          {isPlano100k && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-emerald-900 flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm">Perfil Simplificado ({planoSel?.nomeExibido || 'Plano 100 Mil'})</h4>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Este plano possui contratação simplificada com isenção do preenchimento de áreas de atuação e faturamento anual.
                </p>
              </div>
            </div>
          )}

          {/* Faturamento Anual se aplicável e não for plano 100k */}
          {!isPlano100k && resolvedRamoConfig.hasFaturamento && (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="field-label">
                  {resolvedRamoConfig.faturamentoLabel || 'Faturamento Bruto Anual'} (Últimos 12 meses) *
                </span>
                <input
                  required
                  value={form.faturamentoAntes}
                  onChange={(e) => updateField('faturamentoAntes', formatMoneyInput(e.target.value))}
                  className="form-input"
                  placeholder="R$ 0,00"
                />
              </label>

              <label className="block">
                <span className="field-label">Faturamento Estimado (Próximos 12 meses) *</span>
                <input
                  required
                  value={form.faturamentoDepois}
                  onChange={(e) => updateField('faturamentoDepois', formatMoneyInput(e.target.value))}
                  className="form-input"
                  placeholder="R$ 0,00"
                />
              </label>
            </div>
          )}

          {/* Especialidades Dinâmicas do Ramo (Oculto no Plano 100k Simplificado) */}
          {!isPlano100k && resolvedRamoConfig.especialidades && resolvedRamoConfig.especialidades.length > 0 && (
            <div>
              <span className="field-label mb-2 block text-gray-900 font-semibold">
                {resolvedRamoConfig.especialidadesLabel || 'Áreas de Atuação e Especialidades'} *
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {resolvedRamoConfig.especialidades.map((esp) => {
                  const isChecked = form.especialidades.includes(esp.key);
                  return (
                    <label
                      key={esp.key}
                      className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start space-x-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleEspecialidade(esp.key)}
                          className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                        <div>
                          <span className="text-xs font-bold text-gray-900 block leading-snug">{esp.label}</span>
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
            </div>
          )}

          {/* Switches de Pessoa Politicamente Exposta (PPE) */}
          {!isPlano100k && resolvedRamoConfig.hasPpe && (
            <div className="space-y-4 pt-2">
              <h4 className="text-base font-bold text-primary">Pessoa Politicamente Exposta (PPE)</h4>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="field-label">Você ou sua empresa ocupou cargo público relevante nos últimos 5 anos?</span>
                  <select
                    value={form.ppeCargos}
                    onChange={(e) => updateField('ppeCargos', e.target.value)}
                    className="form-input"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </label>

                <label className="block">
                  <span className="field-label">Seu sócio, cônjuge ou representante legal é PPE?</span>
                  <select
                    value={form.ppeRepresenta}
                    onChange={(e) => updateField('ppeRepresenta', e.target.value)}
                    className="form-input"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </label>
              </div>

              {(form.ppeCargos === 'Sim' || form.ppeRepresenta === 'Sim') && (
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
                  <span className="field-label block font-semibold text-primary">
                    Selecione as funções públicas ocupadas:
                  </span>
                  <div className="space-y-2">
                    {cargosPpe.map((cargo) => (
                      <label key={cargo.id} className="flex items-start space-x-2 cursor-pointer text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.ppeCargoSelect.includes(cargo.id)}
                          onChange={() => handleTogglePpe(cargo.id)}
                          className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{cargo.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2 cursor-pointer"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PASSO 4: DECLARAÇÕES & UNDERWRITING ESPECÍFICO DO RAMO             */}
      {/* ================================================================== */}
      {step === 4 && (
        <div className="card space-y-6">
          {/* Dados de Seguro Anterior se for Renovação */}
          {form.isRenovacao === 'Sim' && (
            <div className="space-y-4 border-b border-gray-200 pb-6">
              <h3 className="text-lg font-bold text-primary">Seguro Anterior (Últimos 2 anos)</h3>

              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="field-label">Seguradora Anterior *</span>
                  <input
                    required
                    value={form.seguradora}
                    onChange={(e) => updateField('seguradora', e.target.value)}
                    className="form-input"
                    placeholder="Ex: Porto Seguro, Kovr, Tokio Marine"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Vigência Anterior *</span>
                  <input
                    type="date"
                    required
                    value={form.vigencia}
                    onChange={(e) => updateField('vigencia', e.target.value)}
                    className="form-input"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Limite Segurado Anterior *</span>
                  <input
                    required
                    value={form.limite}
                    onChange={(e) => updateField('limite', formatMoneyInput(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Data de Retroatividade *</span>
                  <input
                    type="date"
                    required
                    value={form.dataRetroativa}
                    onChange={(e) => updateField('dataRetroativa', e.target.value)}
                    className="form-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Questionário de Risco Dinâmico do Ramo */}
          {!isPlano100k && resolvedRamoConfig.requiresUnderwriting !== false ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-primary">Questionário de Risco & Underwriting</h3>
              <p className="text-xs text-gray-500">
                Responda com veracidade. Em caso de resposta afirmativa (&quot;Sim&quot;), o detalhamento circunstanciado é obrigatório.
              </p>

              <div className="space-y-4 pt-2">
                {resolvedRamoConfig.questionarioRisco.map((item) => {
                  const respostaAtual = (form[item.id] || 'Não') as string;
                  const detalheAtual = (form[item.detailKey] || '') as string;

                  return (
                    <div
                      key={item.id}
                      className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3 transition-colors hover:border-gray-300"
                    >
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                        <span className="text-sm text-gray-800 font-medium leading-relaxed">
                          {item.question}
                        </span>
                        <select
                          value={respostaAtual}
                          onChange={(e) => updateField(item.id, e.target.value)}
                          className={`form-input md:w-32 flex-shrink-0 font-bold ${
                            respostaAtual === 'Sim' ? 'text-rose-700 border-rose-300 bg-rose-50/50' : 'text-gray-900'
                          }`}
                        >
                          <option value="Não">Não</option>
                          <option value="Sim">Sim</option>
                        </select>
                      </div>

                      {respostaAtual === 'Sim' && (
                        <label className="block pt-1 animate-fadeIn">
                          <span className="field-label text-rose-700 font-semibold flex items-center space-x-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{item.detailLabel || 'Descreva os detalhes, datas, partes e valores envolvidos:'} *</span>
                          </span>
                          <textarea
                            required
                            value={detalheAtual}
                            onChange={(e) => updateField(item.detailKey, e.target.value)}
                            className="form-input min-h-20 border-rose-300 focus:border-rose-500 bg-white"
                            placeholder="Forneça os detalhes circunstanciados para análise da subscrição de riscos..."
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl text-emerald-900 space-y-2">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <h4 className="font-bold text-sm">Declarações Simplificadas</h4>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                O plano selecionado possui isenção do preenchimento do questionário detalhado de sinistralidade.
                Você pode avançar diretamente para as condições de pagamento.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2 cursor-pointer"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PASSO 5: CONDIÇÕES DE PAGAMENTO & PARCELAMENTO                     */}
      {/* ================================================================== */}
      {step === 5 && (
        <div className="card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-primary">5. Condições de Pagamento</h3>
              <p className="text-xs text-gray-500 mt-0.5">Selecione a opção de parcelamento para formalizar a contratação.</p>
            </div>

            {descontoPercentual > 0 && (
              <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shadow-2xs">
                <Tag className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                <span className="text-xs text-emerald-900 font-semibold">
                  Desconto de <strong>{descontoPercentual}%</strong> aplicado
                </span>
                {!isClientRegistration && (
                  <button
                    type="button"
                    onClick={() => setIsDescontoDrawerOpen(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-950 underline ml-1 cursor-pointer"
                  >
                    Ajustar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Opções de Parcelamento */}
          {planoSel && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {getOpcoesParcelamento(planoSel).map((op) => {
                  const isParcSelected = parcelaSel?.qtd === op.qtd;
                  const valorExibe = formatCurrencyBRL(op.valor);
                  const valorTotalExibe = formatCurrencyBRL(op.valor * op.qtd);

                  return (
                    <div
                      key={op.qtd}
                      onClick={() => setParcelaSel({ qtd: op.qtd, valor: op.valor })}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                        isParcSelected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-500/20'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="font-bold text-sm text-gray-900">
                        {op.qtd}x de {valorExibe}{' '}
                        {op.qtd === 6 && (
                          <span className="text-xs text-amber-600 font-normal">(Juros de 2% a.m.)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Total da proposta: {valorTotalExibe}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campo Opcional de Cupom — Exclusivo da venda assistida pelo vendedor */}
          {!isClientRegistration && (
            <>
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-gray-700">Cupom Promocional</span>
                </div>
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <input
                    type="text"
                    value={cupomCode}
                    onChange={(e) => setCupomCode(e.target.value.toUpperCase())}
                    placeholder="Código do cupom"
                    disabled={cupomAplicado}
                    className="form-input text-xs py-1.5 px-3 max-w-[160px] uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleValidarCupom}
                    disabled={cupomAplicado || !cupomCode.trim()}
                    className="btn btn-secondary text-xs py-1.5 px-3 cursor-pointer"
                  >
                    {cupomAplicado ? 'Aplicado' : 'Validar'}
                  </button>
                </div>
              </div>
              {cupomError && <p className="text-xs text-rose-600">{cupomError}</p>}
              {cupomAplicado && (
                <p className="text-xs text-emerald-700 font-semibold">
                  Cupom aplicado com sucesso: {cupomDesconto}% de desconto!
                </p>
              )}
            </>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleGerarContrato}
              disabled={loading || !planoSel || !parcelaSel}
              className="btn btn-primary flex items-center space-x-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando Contrato no ZapSign...</span>
                </>
              ) : (
                <>
                  <span>Ir para Assinatura</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* PASSO 6: ASSINATURA DIGITAL (ZAPSIGN) & FATURA ASAAS               */}
      {/* ================================================================== */}
      {step === 6 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-primary">6. Assinatura Digital & Emissão da Fatura</h3>

          {!contratoAssinado ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                A proposta foi gerada via <strong>ZapSign</strong>. Realize a assinatura digital pelo quadro abaixo ou envie o link diretamente para o cliente:
              </p>

              {signUrl ? (
                <>
                  {/* Card com Link Copiável do ZapSign para Envio ao Cliente */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <FileText size={14} className="text-primary" />
                        Link de Assinatura do Cliente (ZapSign)
                      </span>
                      <a
                        href={signUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        Abrir em nova aba <ExternalLink size={12} />
                      </a>
                    </div>
                    <p className="text-xs text-gray-600">
                      Copie o link abaixo para enviar ao segurado por WhatsApp ou e-mail, ou conclua a assinatura no quadro interativo a seguir:
                    </p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          readOnly
                          value={signUrl}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          className="form-input text-xs font-mono bg-white text-gray-800 py-2 px-3 select-all flex-1 border border-gray-300 rounded-lg focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopySignUrl}
                          className="btn btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs font-semibold"
                        >
                          {copiedSignUrl ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                          <span>{copiedSignUrl ? 'Copiado!' : 'Copiar Link'}</span>
                        </button>
                      </div>
                      {cotacaoId && (
                        <EnviarPropostaEmailButton
                          cotacaoId={cotacaoId}
                          clientName={form.nome}
                          clientEmail={form.email}
                          valor={planoSel?.parcela}
                          cobertura={planoSel?.cobertura}
                          label="Enviar por E-mail"
                        />
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white h-[520px]">
                    <iframe
                      src={signUrl}
                      className="w-full h-full border-0"
                      allow="geolocation; camera"
                      title="ZapSign Assinatura Digital"
                    />
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm">Carregando painel de assinatura...</p>
                </div>
              )}

              <div className="flex flex-col md:flex-row md:justify-between items-center gap-4 bg-gray-50 border border-gray-200 p-4 rounded-xl">
                <span className="text-xs text-gray-500">
                  Após concluir a assinatura acima, clique em &quot;Verificar Assinatura&quot; para liberar a fatura de pagamento.
                </span>
                <button
                  onClick={handleVerificarAssinatura}
                  disabled={verificandoAssinatura}
                  className="btn btn-primary text-sm whitespace-nowrap flex items-center space-x-2 cursor-pointer"
                >
                  {verificandoAssinatura && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{verificandoAssinatura ? 'Verificando...' : 'Verificar Assinatura'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl flex items-start space-x-4">
                <Check className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-bold text-gray-900 text-base">Assinatura Digital Concluída</h4>
                  <p className="text-sm text-gray-700 mt-1">
                    A proposta foi devidamente assinada e o documento legal foi registrado.
                  </p>
                </div>
              </div>

              {linkPagamento ? (
                <div className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
                    {/* Cabeçalho do Card */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Fatura Emitida com Sucesso
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 pt-1">
                          Pagamento do Seguro
                        </h3>
                        <p className="text-xs text-gray-500">
                          Gateway Oficial Asaas &bull; Suporte a PIX Instantâneo e Boleto Bancário
                        </p>
                      </div>

                      {checkoutId && (
                        <div className="text-left sm:text-right bg-gray-50 sm:bg-transparent p-3 sm:p-0 rounded-lg sm:rounded-none border sm:border-0 border-gray-100">
                          <span className="text-xs text-gray-400 block font-medium">Checkout ID</span>
                          <span className="text-xs font-mono font-bold text-gray-800">{checkoutId}</span>
                        </div>
                      )}
                    </div>

                    {/* Resumo da Cobrança */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <span className="text-xs text-gray-500 block font-medium">Data de Vencimento</span>
                        <span className="text-base font-bold text-gray-900 mt-1 block">
                          {formatDateDisplay(paymentDueDate) || 'A definir'}
                        </span>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <span className="text-xs text-gray-500 block font-medium">Condição Selecionada</span>
                        <span className="text-base font-bold text-gray-900 mt-1 block">
                          {parcelaSel ? `${parcelaSel.qtd}x de ${formatCurrencyBRL(parcelaSel.valor)}` : 'À vista'}
                        </span>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <span className="text-xs text-gray-500 block font-medium">Formas de Pagamento</span>
                        <span className="text-base font-bold text-primary mt-1 block">
                          PIX e Boleto
                        </span>
                      </div>
                    </div>

                    {/* Copiar Link Rápido */}
                    <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <label className="text-xs font-semibold text-gray-700 block">
                        Link Oficial da Fatura:
                      </label>
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <input
                          type="text"
                          readOnly
                          value={linkPagamento}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          className="form-input text-xs font-mono bg-white text-gray-800 py-2.5 px-3 select-all flex-1 border border-gray-300 rounded-lg focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCopyPaymentUrl}
                          className="btn btn-secondary py-2.5 px-4 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer font-semibold"
                        >
                          {copiedPaymentUrl ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          <span>{copiedPaymentUrl ? 'Link Copiado!' : 'Copiar Link'}</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Você pode copiar e enviar este link diretamente ao segurado via WhatsApp ou e-mail.
                      </p>
                    </div>

                    {/* Aviso de Segurança e Conexão Bancária */}
                    <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl flex items-start gap-3 text-xs text-emerald-900">
                      <ShieldCheck className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-emerald-950">
                          Ambiente Seguro Certificado Asaas
                        </p>
                        <p className="text-emerald-800 leading-relaxed">
                          Por diretrizes de segurança bancária do Asaas, o ambiente de pagamento oficial é aberto em uma página segura com suporte a PIX QR Code instantâneo, código Copia e Cola e emissão de Boleto Bancário registrado.
                        </p>
                      </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <a
                        href={linkPagamento}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary flex items-center justify-center space-x-2 text-sm w-full sm:w-auto py-3 px-6 shadow-sm cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Abrir Fatura e Pagar no Asaas</span>
                      </a>

                      {!publicToken && (
                        <button
                          onClick={() => {
                            router.push('/portal/cotacoes');
                            router.refresh();
                          }}
                          className="btn btn-secondary text-sm w-full sm:w-auto py-3 px-5 cursor-pointer"
                        >
                          Voltar para Cotações
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  {paymentBlockedReason ? (
                    <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl max-w-lg w-full text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-amber-900 text-base">Emissão de Cobrança Retida</h4>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        {paymentBlockedReason}
                      </p>
                      <div className="pt-2">
                        <button
                          type="button"
                          disabled
                          className="btn btn-secondary text-xs px-4 py-2 opacity-60 cursor-not-allowed w-full sm:w-auto"
                          title="Apenas administradores podem liberar cobranças com data de vigência anterior à data atual."
                        >
                          Emissão Bloqueada para Parceiro
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <p className="text-sm text-gray-700">Aguardando emissão da fatura no Asaas...</p>
                      <button
                        type="button"
                        onClick={handleGerarPagamento}
                        className="btn btn-secondary text-xs px-4 py-2 mt-1 cursor-pointer"
                      >
                        Tentar emitir fatura novamente
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Drawer Slide-over de Desconto Comercial e Simulação de Comissão (Exclusivo para vendedor) */}
      {!isClientRegistration && (
        <DescontoDrawer
          isOpen={isDescontoDrawerOpen}
          onClose={() => setIsDescontoDrawerOpen(false)}
          descontoPercentual={descontoPercentual}
          onChangeDesconto={(val) => {
            setDescontoPercentual(val);
            setParcelaSel(null);
          }}
          planoSel={planoSel}
          planos={planos}
          onSelectPlano={(p) => {
            setPlanoSel(p);
            setParcelaSel(null);
          }}
          commissionRate={commissionRate}
        />
      )}
    </div>
  );
}
