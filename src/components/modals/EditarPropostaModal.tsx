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
import { formatAtuacao, parseAtuacaoList, sanitizePlanFinancials } from '@/lib/format';
import { rcAdvogadosConfig } from '@/lib/product-schemas';
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

const PLANOS_SUGESTOES = [
  '100k',
  '200k',
  '300k',
  '500k',
  '1M',
  '2M',
  '3M',
  'Plano 100 Mil',
  'Plano 200 Mil',
  'Plano 300 Mil',
  'Plano 500 Mil',
  'Plano 1 Milhão',
  'Plano 2 Milhões',
  'Plano 3 Milhões',
];

export default function EditarPropostaModal({
  isOpen,
  onClose,
  onSuccess,
  cotacao,
  readOnlyFinancials,
}: EditarPropostaModalProps) {
  const router = useRouter();
  const numeroInputRef = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(isOpen);

  // Aba ativa: 'cliente' | 'proposta'
  const [activeTab, setActiveTab] = useState<'cliente' | 'proposta'>('cliente');

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
  const [oab, setOab] = useState('');
  const [oabUf, setOabUf] = useState('');
  const [atuacao, setAtuacao] = useState('');
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
  const [descontoPercent, setDescontoPercent] = useState<number>(0);
  const [maxParcelasPermitidas, setMaxParcelasPermitidas] = useState<number>(6);

  // Controles de feedback e busca
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepSuccess, setCepSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Regra de bloqueio financeiro estrita
  const isFinancialLocked = Boolean(
    readOnlyFinancials ||
      ['assinado', 'pagamento_gerado', 'aprovada', 'emitida'].includes(
        String(cotacao.status).toLowerCase()
      )
  );

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

  // Carrega e preenche os estados a partir da cotação
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
      setOab(cd.oab || '');
      setOabUf(cd.oabUf || cd.ufOab || (cd.uf ? cd.uf.toUpperCase() : ''));
      setAtuacao(formatAtuacao(cd.atuacao));
      setDataInicioVigencia(
        formatDateToInput(cd.dataInicioVigencia || cd.vigencia || cd.dataVigencia || '')
      );
      const planoLoaded = String(cd.nomePlano || cd.tipoDePlano || cd.tipo || 'RC Advogados');
      setNomePlano(planoLoaded);

      // Desconto inicial (respeitando o teto de 40%)
      const descGravado = Number(cd.descontoManualPercent ?? cd.descontoPercentual ?? 0);
      const descInicial = Math.min(40, Math.max(0, descGravado));
      setDescontoPercent(descInicial);

      // Valores com saneamento inteligente contra multiplicação indevida (* 100)
      const rawCob = cotacao.importancia_segurada ?? cd.valorCobertura;
      const rawPrem = cotacao.premio_final ?? cd.valor;
      const sanitized = sanitizePlanFinancials({
        planoNome: planoLoaded,
        cobertura: rawCob,
        premio: rawPrem,
      });

      const parsedCobNum = sanitized.cobertura > 0
        ? sanitized.cobertura
        : (rawCob !== undefined && rawCob !== null ? parseCurrencyToNumber(rawCob) : 0);
      setImportanciaSegurada(parsedCobNum > 0 ? String(parsedCobNum) : '');

      const parsedPremNum = sanitized.premio > 0
        ? sanitized.premio
        : (rawPrem !== undefined && rawPrem !== null ? parseCurrencyToNumber(rawPrem) : 0);
      setPremioFinal(parsedPremNum > 0 ? String(parsedPremNum) : '');

      // Cálculo do prêmio base de referência
      let baseCalculado = Number(cd.valorOriginal || 0);
      if (!baseCalculado || baseCalculado <= 0) {
        if (descInicial > 0 && descInicial < 100 && parsedPremNum > 0) {
          baseCalculado = Math.round((parsedPremNum / (1 - descInicial / 100)) * 100) / 100;
        } else {
          baseCalculado = parsedPremNum;
        }
      }
      setPremioBase(baseCalculado);

      setPlanoFranquia(String(cd.planoFranquia || 'R$ 1.000,00'));
      setParcelas(cd.parcela ? String(cd.parcela) : '1');
      setNotes(cotacao.notes || cd.observacoes || cd.notas || '');

      // Identifica o plano selecionado na lista
      const tipoLower = String(cd.tipoDePlano || cd.tipo || '').toLowerCase();
      const planoMatched = FALLBACK_PLANOS.find(
        (p) =>
          p.tipoDePlano.toLowerCase() === tipoLower ||
          p.nomeExibido.toLowerCase() === planoLoaded.toLowerCase()
      );

      if (planoMatched) {
        setSelectedPlanoTipo(planoMatched.tipoDePlano);
        const maxP = planoMatched.maxParcelas || (planoMatched.tipoDePlano === '100k' ? 1 : 6);
        setMaxParcelasPermitidas(maxP);
      } else if (tipoLower.includes('100k') || planoLoaded.toLowerCase().includes('100k')) {
        setSelectedPlanoTipo('100k');
        setMaxParcelasPermitidas(1);
      } else {
        setSelectedPlanoTipo('custom');
        setMaxParcelasPermitidas(12);
      }

      setErrorMessage(null);
      setSuccessMessage(null);
      setCepSuccess(false);
      setActiveTab('cliente');
    }
  }, [isOpen, cotacao]);

  // Tecla ESC para fechar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

    const plano = planosDisponiveis.find((p) => p.tipoDePlano === tipoOuKey);
    if (!plano) return;

    setNomePlano(plano.nomeExibido);

    // Cobertura
    const numCob = parseCurrencyToNumber(plano.cobertura);
    setImportanciaSegurada(numCob > 0 ? String(numCob) : plano.cobertura);

    // Franquia
    setPlanoFranquia(plano.franquia || 'R$ 1.000,00');

    // Prêmio base de tabela
    const base = parseCurrencyToNumber(plano.parcela);
    setPremioBase(base);

    // Recalcula o prêmio final aplicando o desconto ativo
    const fator = 1 - (descontoPercent / 100);
    const novoFinal = Math.round(base * fator * 100) / 100;
    setPremioFinal(String(novoFinal));

    // Ajusta limites de parcelamento do plano
    const maxP = plano.maxParcelas || (plano.tipoDePlano.toLowerCase() === '100k' ? 1 : 6);
    setMaxParcelasPermitidas(maxP);
    if (Number(parcelas) > maxP) {
      setParcelas(String(maxP));
    }
  };

  // Alteração de desconto comercial (0% a 40%)
  const handleDescontoChange = (novoPercent: number) => {
    if (isFinancialLocked) return;
    const descSeguro = Math.min(40, Math.max(0, Math.round(novoPercent)));
    setDescontoPercent(descSeguro);

    if (premioBase > 0) {
      const fator = 1 - (descSeguro / 100);
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

  // Cálculo das opções de parcelamento em tempo real
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setSaving(true);
    try {
      const existingClientData = parseRawClientData(cotacao.client_data);

      const updatedClientData: Record<string, any> = {
        ...existingClientData,
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
        oab: oab.trim() || existingClientData.oab,
        oabUf: oabUf.trim() ? oabUf.trim().toUpperCase() : existingClientData.oabUf,
        ufOab: oabUf.trim() ? oabUf.trim().toUpperCase() : existingClientData.ufOab,
        atuacao: parseAtuacaoList(atuacao.trim()).length > 0 ? parseAtuacaoList(atuacao.trim()) : existingClientData.atuacao,
        dataInicioVigencia: dataInicioVigencia || existingClientData.dataInicioVigencia,
        vigencia: dataInicioVigencia || existingClientData.vigencia,
        nomePlano: nomePlano.trim() || existingClientData.nomePlano,
        tipoDePlano: selectedPlanoTipo !== 'custom' ? selectedPlanoTipo : (existingClientData.tipoDePlano || nomePlano.trim()),
        tipo: selectedPlanoTipo !== 'custom' ? selectedPlanoTipo : (existingClientData.tipo || nomePlano.trim()),
        planoFranquia: planoFranquia.trim() || existingClientData.planoFranquia,
        parcela: parcelas ? Number(parcelas) : existingClientData.parcela,
        observacoes: notes.trim() || existingClientData.observacoes,
        descontoManualPercent: descontoPercent,
        descontoPercentual: descontoPercent,
        valorOriginal: premioBase > 0 ? premioBase : (existingClientData.valorOriginal || 0),
      };

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
          oab: oab.trim() || null,
          oabUf: oabUf.trim() ? oabUf.trim().toUpperCase() : null,
          atuacao: parseAtuacaoList(atuacao.trim()),
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

      // Só altera valores financeiros se liberado
      if (!isFinancialLocked) {
        const rawCobParsed = parseCurrencyToNumber(importanciaSegurada);
        const rawPremParsed = parseCurrencyToNumber(premioFinal);

        if (premioFinal.trim() !== '' && rawPremParsed <= 0) {
          setErrorMessage('O valor do prêmio deve ser um número válido maior que zero.');
          setActiveTab('proposta');
          setSaving(false);
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
          const vParc = numParcelas > 0 ? Math.round((parsedPremio / numParcelas) * 100) / 100 : parsedPremio;
          updatedClientData.valorParcela = vParc;
        }

        updatedClientData.descontoManualPercent = descontoPercent;
        updatedClientData.descontoPercentual = descontoPercent;
        updatedClientData.valorOriginal = premioBase > 0 ? premioBase : (parsedPremio > 0 ? parsedPremio : 0);
      }

      const res = await fetch(`/api/cotacoes/${cotacao.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.details ? `${data.error} (${data.details})` : (data.error || 'Erro ao salvar os dados da proposta.'));
      }

      setSuccessMessage('Proposta atualizada com sucesso!');
      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha na comunicação com o servidor.');
    } finally {
      setSaving(false);
    }
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
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Container Principal */}
      <div
        className="relative w-full max-w-3xl bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-200"
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
                Proposta ID: <span className="font-mono text-gray-700">{cotacao.id.slice(0, 8)}</span> · {cotacao.client_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                Esta proposta possui contrato assinado ou cobrança gerada. Os dados cadastrais, vigência e notas podem ser alterados livremente. Os valores financeiros (cobertura e prêmio) estão preservados para manter a conformidade com o ZapSign e o Asaas.
              </p>
            </div>
          </div>
        )}

        {/* Navegação por Abas Estilizadas */}
        <div className="px-6 pt-4 border-b border-gray-200 bg-white">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('cliente')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 -mb-[2px] ${
                activeTab === 'cliente'
                  ? 'border-[#0e4a5a] text-[#0e4a5a] bg-teal-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Aba 1: Dados do Cliente & Endereço</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('proposta')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 -mb-[2px] ${
                activeTab === 'proposta'
                  ? 'border-[#0e4a5a] text-[#0e4a5a] bg-teal-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Aba 2: Dados da Proposta & Seguro</span>
              {isFinancialLocked && (
                <span className="inline-flex" aria-label="Valores financeiros bloqueados">
                  <Lock className="w-3 h-3 text-amber-600" />
                </span>
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

            {/* ABA 1: DADOS DO CLIENTE & ENDEREÇO */}
            {activeTab === 'cliente' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Dados de Contato / Cadastrais */}
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
                        placeholder="advogado@escritorio.com"
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

                {/* Endereço com Busca ViaCEP */}
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
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
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

            {/* ABA 2: DADOS DA PROPOSTA & SEGURO */}
            {activeTab === 'proposta' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Seção Profissional */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                    Registro Profissional & Atuação
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Número OAB
                      </label>
                      <input
                        type="text"
                        value={oab}
                        onChange={(e) => setOab(e.target.value)}
                        placeholder="Ex: 123456"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        UF da OAB
                      </label>
                      <select
                        value={oabUf}
                        onChange={(e) => setOabUf(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      >
                        <option value="">Selecione UF da OAB</option>
                        {BRAZILIAN_UFS.map((sigla) => (
                          <option key={sigla} value={sigla}>
                            {sigla}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Área de Atuação
                      </label>
                      <input
                        type="text"
                        list="atuacao-options"
                        value={atuacao}
                        onChange={(e) => setAtuacao(e.target.value)}
                        placeholder="Ex: Civil, Trabalhista..."
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

                {/* Seção 2: Serviço & Plano de Cobertura */}
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
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all ${
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

                {/* Seção 3: Desconto Comercial da Proposta (0% a 40%) */}
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
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {pct}%
                          </button>
                        );
                      })}
                    </div>

                    {/* Simulação e Resumo Financeiro */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-emerald-200/60 text-xs">
                      <div className="bg-white/80 border border-emerald-200/60 rounded-xl p-2.5">
                        <span className="text-gray-500 block text-[11px]">Prêmio de Tabela (Base)</span>
                        <span className="font-bold text-gray-800 text-sm">
                          {formatCurrencyBRL(premioBase || parseCurrencyToNumber(premioFinal))}
                        </span>
                      </div>

                      <div className="bg-white/80 border border-emerald-200/60 rounded-xl p-2.5">
                        <span className="text-emerald-700 block text-[11px] font-semibold">
                          Economia Aplicada ({descontoPercent}%)
                        </span>
                        <span className="font-bold text-emerald-700 text-sm">
                          - {formatCurrencyBRL(
                            Math.round(
                              (premioBase > 0 ? premioBase : parseCurrencyToNumber(premioFinal)) *
                                (descontoPercent / 100) *
                                100
                            ) / 100
                          )}
                        </span>
                      </div>

                      <div className="bg-emerald-100/70 border border-emerald-300/80 rounded-xl p-2.5">
                        <span className="text-emerald-950 block text-[11px] font-bold">Prêmio Final Líquido</span>
                        <span className="font-extrabold text-[#0e4a5a] text-sm">
                          {formatCurrencyBRL(parseCurrencyToNumber(premioFinal))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 4: Condições do Seguro & Vigência */}
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

                {/* Seção 5: Formas de Pagamento & Parcelamento */}
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
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
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
          </div>

          {/* Footer Fixo */}
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 rounded-b-2xl">
            <div className="text-xs text-gray-500">
              {activeTab === 'cliente' ? (
                <span>Preencha os dados cadastrais antes de revisar a apólice.</span>
              ) : (
                <span>Revisão final dos parâmetros e vigência do seguro.</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-2.5 min-h-[44px] rounded-xl bg-[#0e4a5a] text-white hover:bg-[#072a33] text-sm font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#00d4e0]" />
                    <span>Salvando Dados...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-[#00d4e0]" />
                    <span>Salvar Dados</span>
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
