'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, User, X, Loader2, CheckCircle, RefreshCw, ShieldCheck, Phone, Mail, MapPin } from 'lucide-react';

export interface RenewalData {
  hasPreviousPolicy: boolean;
  policyNumber: string;
  seguradora: string;
  vigenciaAnterior: string;
  limite: string;
  franquia: string;
  premio: string;
  dataRetroativa: string;
  dataInicioVigenciaSugerida: string;
  faturamentoAntes: string;
  faturamentoDepois: string;
  atuacao: string[];
  ppeCargos: string;
  ppeRepresenta: string;
  ppeCargoSelect: string[];
  previousQuoteId?: string | null;
  previousSaleId?: string | null;
}

export interface ClienteBuscaResult {
  id: string;
  fullName: string;
  documentNumber: string;
  documentFormatted: string;
  email: string;
  phone: string;
  birthDate: string;
  oab: string;
  dataAtividade: string;
  address: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  };
  renewalData: RenewalData;
}

interface ClienteSearchSelectorProps {
  adminSelectedPartnerId?: string;
  publicToken?: string;
  selectedCliente: ClienteBuscaResult | null;
  isRenovacaoAtiva: boolean;
  onSelectCliente: (cliente: ClienteBuscaResult) => void;
  onApplyRenewal: (renewalData: RenewalData) => void;
  onClearSelection: () => void;
}

function formatDateBr(iso?: string | null) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function ClienteSearchSelector({
  adminSelectedPartnerId,
  publicToken,
  selectedCliente,
  isRenovacaoAtiva,
  onSelectCliente,
  onApplyRenewal,
  onClearSelection,
}: ClienteSearchSelectorProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClienteBuscaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searched, setSearched] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setShowDropdown(false);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const headers: Record<string, string> = {};
        if (publicToken) headers['x-public-token'] = publicToken;

        const url = new URL('/api/clientes/busca', window.location.origin);
        url.searchParams.set('q', trimmed);
        if (adminSelectedPartnerId) {
          url.searchParams.set('partnerId', adminSelectedPartnerId);
        }

        const res = await fetch(url.toString(), { headers });
        const data = await res.json();
        if (data.clients) {
          setResults(data.clients);
          setShowDropdown(true);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error('Erro na pesquisa de clientes:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, adminSelectedPartnerId, publicToken]);

  function handleSelect(c: ClienteBuscaResult) {
    onSelectCliente(c);
    setShowDropdown(false);
    setQuery('');
  }

  return (
    <div ref={wrapperRef} className="relative mb-6">
      {/* SE UM CLIENTE JÁ FOI SELECIONADO */}
      {selectedCliente ? (
        <div className="bg-emerald-50/50 border-2 border-emerald-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg mt-0.5">
                <User size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    Cliente Selecionado
                  </span>
                  <h4 className="font-bold text-gray-900 text-base">{selectedCliente.fullName}</h4>
                  <span className="text-xs font-mono text-gray-600 bg-white border border-emerald-200 px-2 py-0.5 rounded">
                    {selectedCliente.documentFormatted || selectedCliente.documentNumber}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-2 text-xs text-gray-600 flex-wrap">
                  {selectedCliente.email && (
                    <span className="flex items-center gap-1">
                      <Mail size={12} className="text-emerald-700" />
                      {selectedCliente.email}
                    </span>
                  )}
                  {selectedCliente.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} className="text-emerald-700" />
                      {selectedCliente.phone}
                    </span>
                  )}
                  {selectedCliente.oab && (
                    <span className="font-medium text-emerald-800">
                      OAB: {selectedCliente.oab}
                    </span>
                  )}
                  {selectedCliente.address?.cidade && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} className="text-emerald-700" />
                      {selectedCliente.address.cidade}/{selectedCliente.address.uf}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs font-semibold text-gray-500 hover:text-rose-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-rose-200 hover:bg-rose-50 transition cursor-pointer flex items-center gap-1"
              title="Remover seleção e preencher manualmente"
            >
              <X size={14} />
              <span>Trocar / Limpar</span>
            </button>
          </div>

          {/* BANNER DE DETECÇÃO DE RENOVAÇÃO (OPÇÃO 1) */}
          {selectedCliente.renewalData?.hasPreviousPolicy && (
            <div className="mt-3 pt-3 border-t border-emerald-200/80">
              {!isRenovacaoAtiva ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-amber-900">
                        Encontramos apólice anterior para este segurado!
                      </div>
                      <div className="text-xs text-amber-800 mt-0.5">
                        Apólice: <span className="font-semibold">{selectedCliente.renewalData.policyNumber || 'DL-RC'}</span>
                        {selectedCliente.renewalData.vigenciaAnterior && (
                          <span> • Vigência anterior até <span className="font-semibold">{formatDateBr(selectedCliente.renewalData.vigenciaAnterior)}</span></span>
                        )}
                        {selectedCliente.renewalData.limite && (
                          <span> • Limite: <span className="font-semibold">{selectedCliente.renewalData.limite}</span></span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onApplyRenewal(selectedCliente.renewalData)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-white shadow-sm transition hover:opacity-95 cursor-pointer bg-emerald-700 hover:bg-emerald-800"
                  >
                    <RefreshCw size={13} />
                    <span>Sim, carregar como Renovação</span>
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-100/60 border border-emerald-300 rounded-lg p-2.5 text-emerald-900 flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>
                      Modo <strong>Renovação de Apólice</strong> ativado. Os dados do seguro anterior e perfil profissional foram importados.
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                    Apólice: {selectedCliente.renewalData.policyNumber || 'DL-RC'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* CAMPO DE PESQUISA */
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 transition-all hover:border-gray-300">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Search size={14} className="text-primary" />
              <span>Pesquisar Segurado Cadastrado ou Renovação</span>
            </label>
            <span className="text-[11px] text-gray-500 font-medium">
              Autopreencha os dados de clientes já existentes
            </span>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {loading ? (
                <Loader2 size={16} className="animate-spin text-emerald-600" />
              ) : (
                <Search size={16} />
              )}
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (results.length > 0) setShowDropdown(true);
              }}
              placeholder="Digite o Nome completo, CPF/CNPJ ou E-mail do segurado..."
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
            />

            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setShowDropdown(false);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* DROPDOWN DE RESULTADOS */}
          {showDropdown && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-72 overflow-y-auto divide-y divide-gray-100">
              {results.length > 0 ? (
                results.map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => handleSelect(cliente)}
                    className="w-full text-left p-3.5 hover:bg-emerald-50/60 transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm group-hover:text-emerald-700 transition-colors">
                          {cliente.fullName}
                        </span>
                        <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                          {cliente.documentFormatted || cliente.documentNumber}
                        </span>
                        {cliente.renewalData?.hasPreviousPolicy && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <ShieldCheck size={11} className="text-amber-600" />
                            Apólice anterior disponível
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        {cliente.email && <span>{cliente.email}</span>}
                        {cliente.phone && <span>• {cliente.phone}</span>}
                        {cliente.oab && <span>• OAB: {cliente.oab}</span>}
                        {cliente.address?.cidade && (
                          <span>• {cliente.address.cidade}/{cliente.address.uf}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition">
                        Selecionar
                      </span>
                    </div>
                  </button>
                ))
              ) : searched && !loading ? (
                <div className="p-4 text-center text-xs text-gray-500">
                  Nenhum segurado cadastrado localizado com este termo. Você pode continuar preenchendo os dados abaixo para um novo cliente.
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
