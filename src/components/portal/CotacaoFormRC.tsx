'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Search, 
  ShieldCheck, 
  DollarSign, 
  FileText, 
  CreditCard, 
  Percent,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Download
} from 'lucide-react';

interface Plano {
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
  valorPagoKovr: number;
  planoFranquia?: string;
}

interface FormState {
  // Passo 1: Dados do Segurado
  nome: string;
  cpfCnpj: string;
  email: string;
  celular: string;
  oab: string;
  dataNascto: string;
  dataAtividade: string;
  // Endereço
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;

  // Passo 2: Perfil Profissional & Riscos
  faturamentoAntes: string;
  faturamentoDepois: string;
  atuacao: string[]; // civil, previdenciario, etc.
  ppeCargos: string; // 'Sim' | 'Não'
  ppeRepresenta: string; // 'Sim' | 'Não'
  ppeCargoSelect: string[]; // IDs de 1 a 8
  
  isRenovacao: string; // 'Sim' | 'Não'
  
  // Seguro anterior (Condicional)
  seguradora: string;
  vigencia: string;
  limite: string;
  franquiaAnterior: string;
  premio: string;
  dataRetroativa: string;

  // Declarações de Sinistro
  propostaRecusada: string; // 'Sim' | 'Não'
  propostaDetalhe: string;
  reclamacaoProfissional: string; // 'Sim' | 'Não'
  reclamacaoDetalhe: string;
  investigacaoAutoridade: string; // 'Sim' | 'Não'
  investigacaoDetalhe: string;
  fatoTerceiros: string; // 'Sim' | 'Não'
  fatoDetalhe: string;
  pagouReclamacao: string; // 'Sim' | 'Não'
  pagouDetalhe: string;
}

const initialForm: FormState = {
  nome: '',
  cpfCnpj: '',
  email: '',
  celular: '',
  oab: '',
  dataNascto: '',
  dataAtividade: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  faturamentoAntes: '',
  faturamentoDepois: '',
  atuacao: [],
  ppeCargos: 'Não',
  ppeRepresenta: 'Não',
  ppeCargoSelect: [],
  isRenovacao: 'Não',
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

const CARGOS_PPE = [
  { id: '1', text: 'Detentores de mandatos eletivos dos Poderes Executivo e Legislativo da União' },
  { id: '2', text: 'Membros do Tribunal de Contas da União e Procurador-Geral junto ao TCU' },
  { id: '3', text: 'Membros do Conselho Federal da OAB e Conselhos Seccionais' },
  { id: '4', text: 'Ministros de Estado e ocupantes de cargos de escalão equivalente' },
  { id: '5', text: 'Presidentes, vice-presidentes e diretores de autarquias e fundações públicas' },
  { id: '6', text: 'Membros do CNJ, do STF e dos Tribunais Superiores' },
  { id: '7', text: 'Membros do Conselho Nacional do Ministério Público e Procuradores-Gerais' },
  { id: '8', text: 'Membros do Tribunal de Contas da União e o Procurador-Geral do Ministério Público junto ao TCU' }
];

const AREAS_ATUACAO = [
  { key: 'civil', label: 'Civil' },
  { key: 'propriedadeIndustrial', label: 'Propriedade Industrial' },
  { key: 'bancarioFinanceiro', label: 'Bancário/Financeiro' },
  { key: 'criminal', label: 'Criminal' },
  { key: 'tributaria', label: 'Tributária' },
  { key: 'previdenciario', label: 'Previdenciário' },
  { key: 'direitoInternacional', label: 'Direito Internacional' },
  { key: 'fusoesAquisicoes', label: 'Fusões & Aquisições' },
  { key: 'direitoEmpresarial', label: 'Direito Empresarial' },
  { key: 'trabalhista', label: 'Trabalhista' },
  { key: 'societario', label: 'Societário' },
  { key: 'outros', label: 'Outros' }
];

interface CotacaoFormRCProps {
  adminSelectedPartnerId?: string;
  publicToken?: string;
}

export default function CotacaoFormRC({ adminSelectedPartnerId, publicToken }: CotacaoFormRCProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSel, setPlanoSel] = useState<Plano | null>(null);
  const [parcelaSel, setParcelaSel] = useState<{ qtd: number; valor: number } | null>(null);
  
  // Cupons
  const [cupomCode, setCupomCode] = useState('');
  const [cupomDesconto, setCupomDesconto] = useState(0); // 0 a 100%
  const [cupomAplicado, setCupomAplicado] = useState(false);
  const [cupomError, setCupomError] = useState('');

  // Status de Processos
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cotacaoId, setCotacaoId] = useState('');

  // ZapSign & Asaas links
  const [signUrl, setSignUrl] = useState('');
  const [docToken, setDocToken] = useState('');
  const [contratoAssinado, setContratoAssinado] = useState(false);
  const [verificandoAssinatura, setVerificandoAssinatura] = useState(false);
  const [linkPagamento, setLinkPagamento] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [checkoutId, setCheckoutId] = useState('');

  // ------------------------------------------------------------------
  // Helper para os headers públicos
  // ------------------------------------------------------------------
  const getHeaders = (baseHeaders: Record<string, string> = {}) => {
    const headers: Record<string, string> = { ...baseHeaders };
    if (publicToken) {
      headers['x-public-token'] = publicToken;
    }
    return headers;
  };

  // Carrega os planos ao iniciar
  useEffect(() => {
    async function loadPlanos() {
      try {
        const res = await fetch('/api/portal/planos', {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.ok) {
          setPlanos(data.planos);
        }
      } catch (err) {
        console.error('Erro ao buscar planos:', err);
      }
    }
    loadPlanos();
  }, []);

  // Máscaras e Formatações
  const applyCepMask = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  const applyPhoneMask = (v: string) => {
    const r = v.replace(/\D/g, '');
    if (r.length > 10) {
      return r.slice(0, 11).replace(/^(\d\d)(\d{5})(\d{4})$/, '($1) $2-$3');
    }
    return r.slice(0, 10).replace(/^(\d\d)(\d{4})(\d{4})$/, '($1) $2-$3');
  };
  const applyCpfCnpjMask = (v: string) => {
    const r = v.replace(/\D/g, '');
    if (r.length > 11) {
      return r.slice(0, 14).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    return r.slice(0, 11).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  };
  const applyMoneyMask = (v: string) => {
    let value = v.replace(/\D/g, '');
    if (value === '') return '';
    let number = Number(value) / 100;
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const parseMoneyToNumber = (v: string) => {
    if (!v) return 0;
    const clean = v.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(clean) || 0;
  };

  function updateField(field: keyof FormState, value: any) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  // Busca CEP via API
  async function handleCepSearch(cepVal: string) {
    const rawCep = cepVal.replace(/\D/g, '');
    if (rawCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm(current => ({
            ...current,
            cep: cepVal,
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            cidade: data.localidade || '',
            uf: data.uf || ''
          }));
        }
      } catch (err) {
        console.warn('ViaCEP offline:', err);
      }
    }
  }

  // Validação de Cupom
  async function handleValidarCupom() {
    setCupomError('');
    setCupomDesconto(0);
    setCupomAplicado(false);

    if (!cupomCode) return;

    try {
      const res = await fetch('/api/portal/validar-cupom', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ code: cupomCode })
      });
      const data = await res.json();
      if (data.ok) {
        setCupomDesconto(data.desconto);
        setCupomAplicado(true);
      } else {
        setCupomError(data.error || 'Cupom inválido');
      }
    } catch {
      setCupomError('Erro ao validar cupom.');
    }
  }

  // Calcula parcelamento
  function getOpcoesParcelamento(plano: Plano) {
    const valorOriginal = parseMoneyToNumber(plano.parcela);
    const fatorDesconto = 1 - cupomDesconto / 100;
    const valorComDesconto = valorOriginal * fatorDesconto;

    const parseParcela = (parcStr?: string, defaultVal = 0) => {
      if (!parcStr) return 0;
      return parseMoneyToNumber(parcStr) * fatorDesconto;
    };

    const opcoes = [
      { qtd: 1, valor: valorComDesconto },
      { qtd: 2, valor: parseParcela(plano.parcela2X) || (valorComDesconto / 2) },
      { qtd: 3, valor: parseParcela(plano.parcela3X) || (valorComDesconto / 3) },
      { qtd: 4, valor: parseParcela(plano.parcela4X) || (valorComDesconto / 4) },
      { qtd: 6, valor: parseParcela(plano.parcela6X) || (valorComDesconto / 6) }
    ];

    // Se o plano for 100k, a Kovr só permite 1x (à vista)
    if (plano.tipoDePlano === '100k') {
      return [opcoes[0]];
    }

    // Filtra parcelas válidas
    const validKeys = ['parcela', 'parcela2X', 'parcela3X', 'parcela4X', 'parcela6X'];
    return opcoes.filter((op, i) => {
      const key = validKeys[i] as keyof Plano;
      return plano[key] && plano[key] !== '' && plano[key] !== 'R$ 0,00';
    });
  }

  // Passo a Passo - Avançar
  function handleNext() {
    setError('');
    
    if (step === 1) {
      if (!planoSel) {
        setError('Selecione um plano antes de continuar.');
        return;
      }
    }

    if (step === 2) {
      if (!form.nome || !form.cpfCnpj || !form.email || !form.celular || !form.oab || !form.dataNascto || !form.dataAtividade) {
        setError('Preencha todos os campos obrigatórios do segurado.');
        return;
      }
      if (!form.cep || !form.logradouro || !form.numero || !form.bairro || !form.cidade || !form.uf) {
        setError('Preencha os campos obrigatórios de endereço.');
        return;
      }
    }

    if (step === 3) {
      if (planoSel?.tipoDePlano !== '100k') {
        if (!form.faturamentoAntes || !form.faturamentoDepois) {
          setError('Informe o faturamento bruto dos períodos indicados.');
          return;
        }
        if (form.atuacao.length === 0) {
          setError('Selecione ao menos uma área de atuação.');
          return;
        }
        if (form.ppeCargos === 'Sim' && form.ppeCargoSelect.length === 0) {
          setError('Selecione ao menos um cargo público de PPE.');
          return;
        }
      }
    }

    if (step === 4) {
      if (form.isRenovacao === 'Sim') {
        if (!form.seguradora || !form.vigencia || !form.limite || !form.franquiaAnterior || !form.premio || !form.dataRetroativa) {
          setError('Preencha todas as informações do seguro anterior.');
          return;
        }
      }
    }

    setStep(step + 1);
  }

  function handleBack() {
    setError('');
    setStep(step - 1);
  }

  // Cria a Cotação e gera Contrato no ZapSign
  async function handleGerarContrato() {
    if (!planoSel || !parcelaSel) {
      setError('Selecione uma cobertura e a condição de pagamento.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const valorTotal = parseMoneyToNumber(planoSel.parcela) * (1 - cupomDesconto / 100);
      const valorParcela = parcelaSel.valor;

      const formatDateForWix = (dateStr: string) => {
        if (!dateStr) return null;
        return new Date(dateStr + 'T15:00:00Z').toISOString();
      };

      const payloadClientData: any = {
        ...form,
        cpf: form.cpfCnpj.replace(/\D/g, ''),
        dataNascto: formatDateForWix(form.dataNascto),
        dataAtividade: formatDateForWix(form.dataAtividade),
        vigencia: form.vigencia ? formatDateForWix(form.vigencia) : null,
        dataRetroativa: form.dataRetroativa ? formatDateForWix(form.dataRetroativa) : null,
        renovacao: form.isRenovacao === 'Sim',
        atuacao: form.atuacao.length > 0 ? form.atuacao.join(':') : '',
        ppeCargoSelect: form.ppeCargoSelect.length > 0 ? form.ppeCargoSelect.join(',') : '0',
        tipo: planoSel.tipoDePlano,
        nomePlano: planoSel.nomeExibido,
        planoFranquia: planoSel.franquia,
        valor: valorTotal,
        valorParcela: valorParcela,
        parcela: parcelaSel.qtd,
        cupomCodigo: cupomAplicado ? cupomCode : null,
        cupomDesconto: cupomDesconto,
        valorCobertura: planoSel.cobertura,
        lgpd: 1
      };

      delete payloadClientData.cpfCnpj;
      delete payloadClientData.isRenovacao;

      const payload = {
        clientName: form.nome,
        clientCpfCnpj: form.cpfCnpj.replace(/\D/g, ''),
        clientEmail: form.email,
        clientPhone: form.celular,
        importanciaSegurada: parseMoneyToNumber(planoSel.cobertura),
        clientData: payloadClientData,
        adminSelectedPartnerId
      };

      // 1. Cria a cotação
      const res = await fetch('/api/cotacoes', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Erro ao salvar cotação.');
        setLoading(false);
        return;
      }

      const id = data.cotacao.id;
      setCotacaoId(id);

      // 2. Chama a API para gerar contrato no ZapSign
      const zapRes = await fetch(`/api/portal/cotacoes/${id}/gerar-contrato`, {
        method: 'POST',
        headers: getHeaders()
      });
      const zapData = await zapRes.json();

      if (zapRes.ok && zapData.ok) {
        setSignUrl(zapData.signUrl);
        setDocToken(zapData.docToken);
        setStep(6);
      } else {
        setError(zapData.error || 'Erro ao gerar o contrato no ZapSign.');
      }
    } catch (err) {
      setError('Erro de comunicação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  // Verifica se o documento foi assinado
  async function handleVerificarAssinatura() {
    if (!cotacaoId) return;

    setVerificandoAssinatura(true);
    setError('');

    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/verificar-assinatura`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.ok && data.assinado) {
        setContratoAssinado(true);
        setSuccess('Contrato assinado com sucesso! Gerando fatura...');
        
        // 3. Após assinado, gera pagamento no Asaas
        await handleGerarPagamento();
      } else {
        setError('O contrato ainda não consta como assinado. Complete a assinatura no painel.');
      }
    } catch {
      setError('Erro ao verificar assinatura.');
    } finally {
      setVerificandoAssinatura(false);
    }
  }

  // Gera o pagamento no Asaas
  async function handleGerarPagamento() {
    try {
      const res = await fetch(`/api/portal/cotacoes/${cotacaoId}/gerar-pagamento`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setLinkPagamento(data.linkBoleto);
        setPaymentDueDate(data.dueDate);
        setCheckoutId(data.checkoutId);
      } else {
        setError(data.error || 'Contrato assinado, mas falha ao gerar o boleto Asaas.');
      }
    } catch {
      setError('Erro ao gerar pagamento no Asaas.');
    }
  }

  // Toggle de Checkbox
  const handleCheckboxAtuacao = (key: string) => {
    const current = [...form.atuacao];
    const index = current.indexOf(key);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(key);
    }
    updateField('atuacao', current);
  };

  const handleCheckboxPpe = (id: string) => {
    const current = [...form.ppeCargoSelect];
    const index = current.indexOf(id);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }
    updateField('ppeCargoSelect', current);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Indicador de Passos */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        {[
          { num: 1, label: 'Cobertura', icon: ShieldCheck },
          { num: 2, label: 'Segurado', icon: FileText },
          { num: 3, label: 'Perfil', icon: FileText },
          { num: 4, label: 'Declarações', icon: AlertCircle },
          { num: 5, label: 'Pagamento', icon: DollarSign },
          { num: 6, label: 'Assinatura', icon: CreditCard }
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.num} className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                step === s.num 
                  ? 'bg-accent text-slate-900 shadow-[0_0_10px_var(--color-accent)]' 
                  : step > s.num 
                    ? 'bg-primary text-white' 
                    : 'bg-gray-800 text-gray-400'
              }`}>
                {step > s.num ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className={`hidden md:inline text-xs font-semibold ${step === s.num ? 'text-accent' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-500/50 text-red-200 p-4 rounded-xl mb-6 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-950/50 border border-green-500/50 text-green-200 p-4 rounded-xl mb-6 flex items-center space-x-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* PASSO 2: DADOS DO SEGURADO */}
      {step === 2 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">2. Dados do Proponente / Segurado</h3>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Nome Completo</span>
              <input
                required
                value={form.nome}
                onChange={(e) => updateField('nome', e.target.value)}
                className="form-input"
                placeholder="Nome do advogado proponente"
              />
            </label>

            <label className="block">
              <span className="field-label">CPF / CNPJ</span>
              <input
                required
                value={form.cpfCnpj}
                onChange={(e) => updateField('cpfCnpj', applyCpfCnpjMask(e.target.value))}
                className="form-input"
                placeholder="000.000.000-00 ou CNPJ"
              />
            </label>

            <label className="block">
              <span className="field-label">E-mail</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="form-input"
                placeholder="e-mail principal de contato"
              />
            </label>

            <label className="block">
              <span className="field-label">Celular</span>
              <input
                required
                value={form.celular}
                onChange={(e) => updateField('celular', applyPhoneMask(e.target.value))}
                className="form-input"
                placeholder="(00) 00000-0000"
              />
            </label>

            <label className="block">
              <span className="field-label">Inscrição OAB</span>
              <input
                required
                value={form.oab}
                onChange={(e) => updateField('oab', e.target.value)}
                className="form-input"
                placeholder="Número da OAB + UF (Ex: 123456/SP)"
              />
            </label>

            <label className="block">
              <span className="field-label">Data de Nascimento</span>
              <input
                type="date"
                required
                value={form.dataNascto}
                onChange={(e) => updateField('dataNascto', e.target.value)}
                className="form-input"
              />
            </label>

            <label className="block">
              <span className="field-label">Data de Início da Atividade Profissional</span>
              <input
                type="date"
                required
                value={form.dataAtividade}
                onChange={(e) => updateField('dataAtividade', e.target.value)}
                className="form-input"
              />
            </label>
          </div>

          <h3 className="text-lg font-bold text-accent pt-4">Endereço de Contato / Comercial</h3>
          <div className="grid gap-5 md:grid-cols-3">
            <label className="block">
              <span className="field-label">CEP</span>
              <input
                required
                value={form.cep}
                onChange={(e) => {
                  const val = applyCepMask(e.target.value);
                  updateField('cep', val);
                  handleCepSearch(val);
                }}
                className="form-input"
                placeholder="00000-000"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="field-label">Logradouro / Rua</span>
              <input
                required
                value={form.logradouro}
                onChange={(e) => updateField('logradouro', e.target.value)}
                className="form-input"
                placeholder="Avenida, Rua, Praça, etc."
              />
            </label>

            <label className="block">
              <span className="field-label">Número</span>
              <input
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
              <span className="field-label">Bairro</span>
              <input
                required
                value={form.bairro}
                onChange={(e) => updateField('bairro', e.target.value)}
                className="form-input"
                placeholder="Bairro"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="field-label">Cidade</span>
              <input
                required
                value={form.cidade}
                onChange={(e) => updateField('cidade', e.target.value)}
                className="form-input"
                placeholder="Cidade"
              />
            </label>

            <label className="block">
              <span className="field-label">UF</span>
              <input
                required
                maxLength={2}
                value={form.uf}
                onChange={(e) => updateField('uf', e.target.value.toUpperCase())}
                className="form-input text-center"
                placeholder="Estado (SP, RJ, etc.)"
              />
            </label>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 1: COBERTURA */}
      {step === 1 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">1. Seleção de Plano e Cobertura</h3>
          
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {planos.map((plano) => {
              const isSelected = planoSel?.tipoDePlano === plano.tipoDePlano;
              return (
                <div
                  key={plano.tipoDePlano}
                  onClick={() => {
                    setPlanoSel(plano);
                    setParcelaSel(null);
                  }}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between ${
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-[0_0_15px_rgba(0,212,224,0.15)]'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-base text-white">{plano.nomeExibido}</h4>
                    <div className="mt-3 text-2xl font-black text-accent">{plano.cobertura}</div>
                    <div className="text-xs text-gray-400 mt-1">Limite Máximo de Cobertura</div>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-3 text-sm text-gray-300 space-y-2">
                    <div>
                      <span className="text-gray-400 text-xs block">Franquia obrigatória</span>
                      <span className="font-semibold text-white">{plano.franquia}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block">Valor à vista</span>
                      <span className="font-semibold text-emerald-400">{plano.parcela}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleNext}
              disabled={!planoSel}
              className="btn btn-primary flex items-center space-x-2"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 3: PERFIL PROFISSIONAL */}
      {step === 3 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">3. Renovação e Perfil</h3>
          
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-4">
            <label className="block">
              <span className="field-label text-white">É uma renovação de apólice?</span>
              <select
                value={form.isRenovacao}
                onChange={(e) => updateField('isRenovacao', e.target.value)}
                className="form-input md:w-64 mt-2"
              >
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>
          </div>

          {planoSel?.tipoDePlano !== '100k' && (
            <>
              <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Faturamento Bruto Anual (Últimos 12 meses)</span>
              <input
                required
                value={form.faturamentoAntes}
                onChange={(e) => updateField('faturamentoAntes', applyMoneyMask(e.target.value))}
                className="form-input"
                placeholder="R$ 0,00"
              />
            </label>

            <label className="block">
              <span className="field-label">Faturamento Estimado (Próximos 12 meses)</span>
              <input
                required
                value={form.faturamentoDepois}
                onChange={(e) => updateField('faturamentoDepois', applyMoneyMask(e.target.value))}
                className="form-input"
                placeholder="R$ 0,00"
              />
            </label>
          </div>

          <div>
            <span className="field-label mb-2 block">Áreas de Atuação</span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {AREAS_ATUACAO.map((area) => (
                <label key={area.key} className="flex items-center space-x-2 cursor-pointer bg-slate-900 border border-slate-800 p-3 rounded-lg hover:border-accent/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.atuacao.includes(area.key)}
                    onChange={() => handleCheckboxAtuacao(area.key)}
                    className="rounded border-slate-700 bg-slate-800 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-gray-300">{area.label}</span>
                </label>
              ))}
            </div>
          </div>

          <h3 className="text-lg font-bold text-accent pt-4">Pessoa Politicamente Exposta (PPE)</h3>
          
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
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
              <span className="field-label block font-semibold text-accent">Selecione as funções ocupadas:</span>
              <div className="space-y-2">
                {CARGOS_PPE.map((cargo) => (
                  <label key={cargo.id} className="flex items-start space-x-2 cursor-pointer text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.ppeCargoSelect.includes(cargo.id)}
                      onChange={() => handleCheckboxPpe(cargo.id)}
                      className="mt-1 rounded border-slate-700 bg-slate-800 text-accent focus:ring-accent"
                    />
                    <span>{cargo.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
            </>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 4: DECLARAÇÕES & HISTÓRICO */}
      {step === 4 && (
        <div className="card space-y-6">
          {form.isRenovacao === 'Sim' && (
            <>
              <h3 className="text-lg font-bold text-accent">3. Seguro Anterior (Últimos 2 anos)</h3>
              
              <div className="grid gap-5 md:grid-cols-3">
                <label className="block">
                  <span className="field-label">Seguradora</span>
                  <input
                    value={form.seguradora}
                    onChange={(e) => updateField('seguradora', e.target.value)}
                    className="form-input"
                    placeholder="Ex: Porto Seguro"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Vigência</span>
                  <input
                    type="date"
                    value={form.vigencia}
                    onChange={(e) => updateField('vigencia', e.target.value)}
                    className="form-input"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Limite Segurado</span>
                  <input
                    value={form.limite}
                    onChange={(e) => updateField('limite', applyMoneyMask(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Franquia</span>
                  <input
                    value={form.franquiaAnterior}
                    onChange={(e) => updateField('franquiaAnterior', applyMoneyMask(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Prêmio Líquido Pago</span>
                  <input
                    value={form.premio}
                    onChange={(e) => updateField('premio', applyMoneyMask(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Data de Retroatividade</span>
                  <input
                    type="date"
                    value={form.dataRetroativa}
                    onChange={(e) => updateField('dataRetroativa', e.target.value)}
                    className="form-input"
                  />
                </label>
              </div>
            </>
          )}

          {planoSel?.tipoDePlano !== '100k' ? (
            <>
              <h3 className="text-lg font-bold text-accent pt-4">Questionário de Risco (Underwriting)</h3>
              
              <div className="space-y-4">
                {[
                  {
                    id: 'propostaRecusada',
                    q: 'Já teve proposta de seguro recusada, cancelada ou com recusa de renovação?',
                    det: 'propostaDetalhe'
                  },
                  {
                    id: 'reclamacaoProfissional',
                    q: 'Já houve alguma reclamação, queixa, notificação ou ação judicial de terceiros alegando falha/dano profissional nos últimos 2 anos?',
                    det: 'reclamacaoDetalhe'
                  },
                  {
                    id: 'investigacaoAutoridade',
                    q: 'Responde ou já respondeu a algum processo ético, disciplinar (como OAB) ou administrativo nos últimos 2 anos?',
                    det: 'investigacaoDetalhe'
                  },
                  {
                    id: 'fatoTerceiros',
                    q: 'Tem conhecimento de algum fato, ato, omissão, queixa pendente ou circunstância que possa motivar reclamação judicial no futuro?',
                    det: 'fatoDetalhe'
                  },
                  {
                    id: 'pagouReclamacao',
                    q: 'Já realizou algum pagamento de indenização com recursos próprios por falhas profissionais nos últimos 2 anos?',
                    det: 'pagouDetalhe'
                  }
                ].map((item) => {
                  const val = form[item.id as keyof FormState] as string;
                  return (
                    <div key={item.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                        <span className="text-sm text-gray-300 font-medium">{item.q}</span>
                        <select
                          value={val}
                          onChange={(e) => updateField(item.id as keyof FormState, e.target.value)}
                          className="form-input md:w-32"
                        >
                          <option value="Não">Não</option>
                          <option value="Sim">Sim</option>
                        </select>
                      </div>
                      {val === 'Sim' && (
                        <label className="block">
                          <span className="field-label text-red-300 font-semibold">Descreva os detalhes e fatos:</span>
                          <textarea
                            required
                            value={form[item.det as keyof FormState] as string}
                            onChange={(e) => updateField(item.det as keyof FormState, e.target.value)}
                            className="form-input min-h-20 border-red-900/50 focus:border-red-500"
                            placeholder="Informe datas, motivos e valores envolvidos..."
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-5 rounded-xl text-emerald-200">
              <span className="font-semibold block mb-1">Declarações Simplificadas</span>
              O plano de R$ 100.000 (100k) selecionado possui isenção do preenchimento do questionário de risco. Você pode avançar.
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 5: PAGAMENTO */}
      {step === 5 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">5. Pagamento</h3>

          {/* Cupom Promocional */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
            <h4 className="font-bold text-sm text-white flex items-center space-x-2">
              <Percent className="w-4 h-4 text-accent" />
              <span>Cupom Promocional</span>
            </h4>
            <div className="flex gap-3">
              <input
                value={cupomCode}
                onChange={(e) => setCupomCode(e.target.value)}
                className="form-input max-w-xs"
                placeholder="Insira o código do cupom"
                disabled={cupomAplicado}
              />
              {!cupomAplicado ? (
                <button
                  onClick={handleValidarCupom}
                  className="btn btn-secondary text-sm px-4 py-2"
                >
                  Aplicar
                </button>
              ) : (
                <button
                  onClick={() => {
                    setCupomAplicado(false);
                    setCupomDesconto(0);
                    setCupomCode('');
                  }}
                  className="btn btn-secondary bg-red-950/20 text-red-400 border-red-900 hover:bg-red-950/40 text-sm px-4 py-2"
                >
                  Remover
                </button>
              )}
            </div>
            {cupomError && <p className="text-xs text-red-400">{cupomError}</p>}
            {cupomAplicado && (
              <p className="text-xs text-emerald-400 font-semibold">
                Cupom de Desconto de {cupomDesconto}% aplicado com sucesso!
              </p>
            )}
          </div>

          {/* Opções de Parcelamento */}
          {planoSel && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-accent">Condições de Pagamento</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {getOpcoesParcelamento(planoSel).map((op) => {
                  const isParcSelected = parcelaSel?.qtd === op.qtd;
                  const valorExibe = op.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  const valorTotalExibe = (op.valor * op.qtd).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  
                  return (
                    <div
                      key={op.qtd}
                      onClick={() => setParcelaSel({ qtd: op.qtd, valor: op.valor })}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-colors ${
                        isParcSelected
                          ? 'border-accent bg-accent/5'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-sm text-gray-200">
                        {op.qtd}x de {valorExibe} {op.qtd === 6 && <span className="text-xs text-orange-400 font-normal">(Juros de 2% a.m.)</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Total a pagar: {valorTotalExibe}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleGerarContrato}
              disabled={loading || !planoSel || !parcelaSel}
              className="btn btn-primary flex items-center space-x-2"
            >
              {loading ? (
                <span>Gerando Contrato...</span>
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

      {/* PASSO 6: ASSINATURA E PAGAMENTO */}
      {step === 6 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">4. Assinatura Digital do Contrato</h3>

          {!contratoAssinado ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">
                O contrato de proposta foi gerado via **ZapSign**. Por favor, realize a assinatura no painel abaixo:
              </p>
              
              {signUrl && (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[500px]">
                  <iframe
                    src={signUrl}
                    className="w-full h-full border-0"
                    allow="geolocation; camera"
                  />
                </div>
              )}

              <div className="flex flex-col md:flex-row md:justify-between items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs text-gray-400">
                  Após assinar no quadro acima, clique em "Verificar Assinatura" para liberar a fatura de pagamento.
                </span>
                <button
                  onClick={handleVerificarAssinatura}
                  disabled={verificandoAssinatura}
                  className="btn btn-primary text-sm whitespace-nowrap"
                >
                  {verificandoAssinatura ? 'Verificando...' : 'Verificar Assinatura'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-emerald-950/20 border border-emerald-500/30 p-5 rounded-xl flex items-start space-x-4">
                <Check className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-bold text-white text-base">Assinatura Digital Concluída</h4>
                  <p className="text-sm text-gray-300 mt-1">
                    A proposta foi assinada e o documento final foi gerado com sucesso.
                  </p>
                </div>
              </div>

              {linkPagamento ? (
                <div className="space-y-5">
                  <h3 className="text-lg font-bold text-accent">Pagamento do Seguro (Asaas)</h3>
                  
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Status</span>
                      <span className="text-emerald-400 font-bold">Fatura Emitida</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Data de Vencimento</span>
                      <span className="text-white font-bold">{formatDateDisplay(paymentDueDate)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Checkout ID</span>
                      <span className="text-white font-bold">{checkoutId}</span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-300">
                    Efetue o pagamento através da fatura oficial abaixo (suporta Boleto e PIX):
                  </p>

                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 h-[550px]">
                    <iframe
                      src={linkPagamento}
                      className="w-full h-full border-0"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 pt-2">
                    <a
                      href={linkPagamento}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary flex items-center justify-center space-x-2 text-sm w-full md:w-auto"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir Pagamento em Nova Aba</span>
                    </a>
                    
                    <button
                      onClick={() => {
                        router.push('/portal/cotacoes');
                        router.refresh();
                      }}
                      className="btn btn-secondary text-sm w-full md:w-auto"
                    >
                      Voltar para Cotações
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                  <p className="text-sm text-gray-300">Gerando cobrança no Asaas...</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateDisplay(dStr: string) {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dStr;
}
