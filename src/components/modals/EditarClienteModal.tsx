'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, UserCheck, Loader2, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  BRAZILIAN_UFS,
  maskCpfCnpj,
  maskPhone,
  maskCep,
  formatDateToInput,
  cleanDigits,
} from './masks';

export interface EditarClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  cliente: {
    id: string;
    full_name: string;
    document_number: string;
    email?: string | null;
    phone?: string | null;
    birth_date?: string | null;
    address?: {
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
    };
  };
}

export default function EditarClienteModal({
  isOpen,
  onClose,
  onSuccess,
  cliente,
}: EditarClienteModalProps) {
  const router = useRouter();
  const numeroInputRef = useRef<HTMLInputElement>(null);

  // Estados dos campos
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  // Endereço
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  // Estados de controle
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepSuccess, setCepSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sincroniza dados ao abrir o modal
  useEffect(() => {
    if (isOpen && cliente) {
      setFullName(cliente.full_name || '');
      setDocumentNumber(maskCpfCnpj(cliente.document_number || ''));
      setEmail(cliente.email || '');
      setPhone(maskPhone(cliente.phone || ''));
      setBirthDate(formatDateToInput(cliente.birth_date));

      const addr = cliente.address || {};
      setCep(maskCep(addr.cep || ''));
      setLogradouro(addr.logradouro || '');
      setNumero(addr.numero || '');
      setComplemento(addr.complemento || '');
      setBairro(addr.bairro || '');
      setCidade(addr.cidade || '');
      setUf(addr.uf ? addr.uf.toUpperCase() : '');

      setErrorMessage(null);
      setSuccessMessage(null);
      setCepSuccess(false);
    }
  }, [isOpen, cliente]);

  // Fechar com tecla ESC
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

  // Trava scroll do body enquanto o modal estiver aberto
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

  // Busca automática no ViaCEP
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
        // Falha na busca; usuário segue digitando normalmente
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocumentNumber(maskCpfCnpj(e.target.value));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(maskPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = fullName.trim();
    if (!cleanName) {
      setErrorMessage('O nome completo do cliente é obrigatório.');
      return;
    }

    const docDigits = cleanDigits(documentNumber);
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setErrorMessage('Informe um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos).');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: cleanName,
        full_name: cleanName,
        documentNumber: docDigits,
        document_number: docDigits,
        email: email.trim() || null,
        phone: cleanDigits(phone) || null,
        birthDate: birthDate || null,
        birth_date: birthDate || null,
        address: {
          cep: cleanDigits(cep) || null,
          logradouro: logradouro.trim() || null,
          numero: numero.trim() || null,
          complemento: complemento.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          uf: uf.trim() ? uf.trim().toUpperCase() : null,
        },
      };

      const res = await fetch(`/api/clientes/${cliente.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.details ? `${data.error} (${data.details})` : (data.error || 'Não foi possível salvar as alterações do cliente.'));
      }

      setSuccessMessage('Dados do cliente atualizados com sucesso!');
      router.refresh();
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao atualizar dados do cliente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-cliente-titulo"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Container do Modal */}
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#0e4a5a] shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="modal-editar-cliente-titulo"
                className="text-lg font-bold text-gray-900 tracking-tight"
              >
                Editar Dados do Cliente
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Atualize as informações cadastrais e endereço de faturamento do segurado.
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

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Mensagem de Erro */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Mensagem de Sucesso */}
            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Seção 1: Dados Pessoais / Cadastrais */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 pb-1 border-b border-gray-100">
                Informações Pessoais
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nome Completo */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo de Souza"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* CPF / CNPJ */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    CPF ou CNPJ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={documentNumber}
                    onChange={handleDocumentChange}
                    placeholder="000.000.000-00 ou CNPJ"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all font-mono"
                  />
                </div>

                {/* Data de Nascimento */}
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

                {/* E-mail */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    E-mail do Cliente
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@exemplo.com.br"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* Telefone / Celular */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Celular / Telefone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Seção 2: Endereço com Busca ViaCEP */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                  Endereço do Segurado
                </h3>
                {loadingCep && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#0e4a5a] font-medium animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-[#00d4e0]" /> Buscando CEP...
                  </span>
                )}
                {cepSuccess && !loadingCep && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Endereço localizado
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* CEP */}
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    CEP
                  </label>
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

                {/* Logradouro */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Logradouro / Rua / Avenida
                  </label>
                  <input
                    type="text"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                    placeholder="Rua das Flores"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* Número */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Número
                  </label>
                  <input
                    ref={numeroInputRef}
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="123"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* Complemento */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    placeholder="Apto 101, Bloco B, Sala 4"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* Bairro */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    placeholder="Centro"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* Cidade */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Joinville"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 transition-all"
                  />
                </div>

                {/* UF */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    UF
                  </label>
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

          {/* Footer Fixo */}
          <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 rounded-b-2xl">
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
                  <span>Salvando Alterações...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 text-[#00d4e0]" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
