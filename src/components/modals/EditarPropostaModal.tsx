'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  };
  readOnlyFinancials?: boolean; // Se true ou se status for assinado/pagamento_gerado/aprovada, bloqueia edição de prêmio/cobertura
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
}: EditarPropostaModalProps) {
  const router = useRouter();
  const numeroInputRef = useRef<HTMLInputElement>(null);

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
      setAtuacao(
        Array.isArray(cd.atuacao)
          ? cd.atuacao.join(', ')
          : String(cd.atuacao || 'Civil')
      );
      setDataInicioVigencia(
        formatDateToInput(cd.dataInicioVigencia || cd.vigencia || cd.dataVigencia || '')
      );
      setNomePlano(String(cd.nomePlano || cd.tipoDePlano || 'RC Advogados'));

      // Valores
      const coberturaNum = cotacao.importancia_segurada ?? cd.valorCobertura;
      setImportanciaSegurada(
        coberturaNum !== undefined && coberturaNum !== null
          ? String(coberturaNum)
          : ''
      );

      const premioNum = cotacao.premio_final ?? cd.valor;
      setPremioFinal(
        premioNum !== undefined && premioNum !== null ? String(premioNum) : ''
      );

      setPlanoFranquia(String(cd.planoFranquia || 'R$ 1.000,00'));
      setParcelas(cd.parcela ? String(cd.parcela) : '1');
      setNotes(cotacao.notes || cd.observacoes || cd.notas || '');

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

  // Trava scroll do body
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
        atuacao: atuacao.trim() || existingClientData.atuacao,
        dataInicioVigencia: dataInicioVigencia || existingClientData.dataInicioVigencia,
        vigencia: dataInicioVigencia || existingClientData.vigencia,
        nomePlano: nomePlano.trim() || existingClientData.nomePlano,
        planoFranquia: planoFranquia.trim() || existingClientData.planoFranquia,
        parcela: parcelas ? Number(parcelas) : existingClientData.parcela,
        observacoes: notes.trim() || existingClientData.observacoes,
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
          atuacao: atuacao.trim() || null,
          dataInicioVigencia: dataInicioVigencia || null,
          planoNome: nomePlano.trim() || null,
          franquia: planoFranquia.trim() || null,
          parcela: parcelas ? Number(parcelas) : 1,
          notes: notes.trim() || null,
        },
        client_data: updatedClientData,
      };

      // Só altera valores financeiros se liberado
      if (!isFinancialLocked) {
        const parsedCobertura = parseCurrencyToNumber(importanciaSegurada);
        const parsedPremio = parseCurrencyToNumber(premioFinal);

        if (parsedCobertura > 0) {
          payload.importancia_segurada = parsedCobertura;
          payload.proposalData.importanciaSegurada = parsedCobertura;
          updatedClientData.valorCobertura = parsedCobertura;
        }
        if (parsedPremio > 0) {
          payload.premio_final = parsedPremio;
          payload.proposalData.premioFinal = parsedPremio;
          updatedClientData.valor = parsedPremio;
        }
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-proposta-titulo"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
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

                {/* Seção Condições da Apólice / Seguro */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                    Condições do Seguro & Vigência
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Nome do Plano Contratado
                      </label>
                      <input
                        type="text"
                        value={nomePlano}
                        onChange={(e) => setNomePlano(e.target.value)}
                        placeholder="RC Advogados Essencial"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      />
                    </div>

                    {/* Cobertura / Importância Segurada */}
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
                            ? formatCurrencyBRL(importanciaSegurada)
                            : importanciaSegurada
                        }
                        onChange={(e) => setImportanciaSegurada(e.target.value)}
                        placeholder="R$ 500.000,00"
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all ${
                          isFinancialLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-white border-gray-300 text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20'
                        }`}
                      />
                    </div>

                    {/* Prêmio Final */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-gray-700">
                          Prêmio Total (R$)
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
                          isFinancialLocked ? formatCurrencyBRL(premioFinal) : premioFinal
                        }
                        onChange={(e) => setPremioFinal(e.target.value)}
                        placeholder="R$ 1.500,00"
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-all ${
                          isFinancialLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-white border-gray-300 text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20'
                        }`}
                      />
                    </div>

                    {/* Franquia */}
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

                    {/* Parcelas */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Condição de Pagamento (Parcelas)
                      </label>
                      <select
                        value={parcelas}
                        onChange={(e) => setParcelas(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                      >
                        <option value="1">1x À Vista</option>
                        <option value="2">2x Parcelas</option>
                        <option value="3">3x Parcelas</option>
                        <option value="4">4x Parcelas</option>
                        <option value="5">5x Parcelas</option>
                        <option value="6">6x Parcelas</option>
                        <option value="10">10x Parcelas</option>
                        <option value="12">12x Parcelas</option>
                      </select>
                    </div>
                  </div>
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
    </div>
  );
}
