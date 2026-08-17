'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, PackagePlus, CheckCircle2, AlertCircle, ShieldCheck, Sparkles, Building2 } from 'lucide-react';

type Partner = { id: string; razao_social: string; nome_fantasia: string | null };

const initial = {
  name: '',
  code: '',
  category: '',
  productType: 'insurance',
  integrationType: 'full_journey' as 'full_journey' | 'external_link',
  externalLinkUrl: '',
  providerName: '',
  insurerCnpj: '',
  description: '',
  publicTitle: '',
  targetAudience: '',
  commissionRate: '',
  minPremium: '',
  useRcJourney: true,
  policyPrefix: 'DL-RC',
  validityDays: '365',
  saleRecognition: 'on_payment',
  renewalEnabled: true,
  requiresUnderwriting: false,
  requiredDocumentsText: '',
  availability: 'all_active',
  partnerIds: [] as string[],
};

export default function NovoProdutoPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadPartners() {
      try {
        const res = await fetch('/api/admin/produtos');
        const data = await res.json();
        setPartners(data.partners || []);
      } catch (err) {
        console.error('Erro ao carregar parceiros', err);
      }
    }
    loadPartners();
  }, []);

  function togglePartner(id: string) {
    setForm((val) => ({
      ...val,
      partnerIds: val.partnerIds.includes(id)
        ? val.partnerIds.filter((item) => item !== id)
        : [...val.partnerIds, id],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/produtos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate),
          minPremium: form.minPremium === '' ? null : Number(form.minPremium),
          validityDays: form.validityDays === '' ? null : Number(form.validityDays),
          requiredDocuments: form.requiredDocumentsText
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      setSaving(false);

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Não foi possível cadastrar o produto.' });
        return;
      }

      setMessage({ type: 'success', text: `Produto "${data.product.name}" cadastrado com sucesso!` });
      setTimeout(() => {
        router.push('/admin/produtos');
      }, 1200);
    } catch {
      setSaving(false);
      setMessage({ type: 'error', text: 'Erro de conexão ao tentar salvar o produto.' });
    }
  }

  const rcFlow = form.useRcJourney;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header com Navegação de Retorno */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/80 pb-5">
        <div>
          <Link
            href="/admin/produtos"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#0e4a5a] hover:text-[#00d4e0] transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Voltar para Catálogo de Produtos</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0e4a5a] text-[#00d4e0] shadow-sm">
              <PackagePlus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Adicionar Novo Produto</h1>
              <p className="text-xs text-gray-500 font-medium">Cadastre uma nova oferta comercial e configure suas regras de comissão e elegibilidade.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alertas de Retorno */}
      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-2xl border text-sm font-semibold animate-in fade-in duration-200 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Formulário Principal em Seções Lógicas (Apple HIG Standard) */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seção 1: Identificação Básica */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
            <Building2 className="h-4 w-4 text-[#00d4e0]" />
            <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-wide">1. Identificação Básica da Oferta</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Nome do Produto <span className="text-red-500">*</span>
              </label>
              <input
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: RC Profissional — Médicos"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Código Interno <span className="text-red-500">*</span>
              </label>
              <input
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 uppercase focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="RC-MED-001"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Categoria <span className="text-red-500">*</span>
              </label>
              <input
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Responsabilidade civil"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Tipo da Oferta <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.productType}
                onChange={(e) => setForm({ ...form, productType: e.target.value })}
              >
                <option value="insurance">Seguro</option>
                <option value="service">Serviço</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Seguradora ou Prestador
              </label>
              <input
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.providerName}
                onChange={(e) => setForm({ ...form, providerName: e.target.value })}
                placeholder="Ex.: Akad Seguros (Opcional)"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                CNPJ do Fornecedor
              </label>
              <input
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.insurerCnpj}
                onChange={(e) => setForm({ ...form, insurerCnpj: e.target.value })}
                placeholder="00.000.000/0001-00 (Opcional)"
              />
            </div>
          </div>
        </div>

        {/* Seção 2: Regras Financeiras e Comerciais */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
            <Sparkles className="h-4 w-4 text-[#00d4e0]" />
            <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-wide">2. Parâmetros Comerciais & Comissões</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Comissão Base (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.commissionRate}
                onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                placeholder="Ex.: 15"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Preço Mínimo (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.minPremium}
                onChange={(e) => setForm({ ...form, minPremium: e.target.value })}
                placeholder="Ex.: 1500.00"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Reconhecimento de Venda
              </label>
              <select
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.saleRecognition}
                onChange={(e) => setForm({ ...form, saleRecognition: e.target.value })}
              >
                <option value="on_payment">No primeiro pagamento</option>
                <option value="on_full_payment">Após quitação total</option>
                <option value="on_issuance">Na emissão da apólice</option>
              </select>
            </div>
          </div>
        </div>

        {/* Seção 3: Apresentação e Público-Alvo */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-5">
          <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-3">
            3. Apresentação Pública & Descrição
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Título Público
              </label>
              <input
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.publicTitle}
                onChange={(e) => setForm({ ...form, publicTitle: e.target.value })}
                placeholder="Como a oferta aparecerá ao parceiro"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Público Elegível / Alvo
              </label>
              <input
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.targetAudience}
                onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                placeholder="Ex.: Médicos, dentistas e clínicas"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Descrição Detalhada
              </label>
              <textarea
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Resumo explicativo para o catálogo do parceiro"
              />
            </div>
          </div>
        </div>

        {/* Seção 4: Modalidade de Operação & Jornada */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
            <ShieldCheck className="h-4 w-4 text-[#00d4e0]" />
            <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-wide">4. Modalidade de Operação & Jornada</h2>
          </div>

          {/* Seleção do Tipo de Integração */}
          <div className="grid gap-4 md:grid-cols-2">
            <div
              onClick={() => setForm({ ...form, integrationType: 'full_journey' })}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                form.integrationType === 'full_journey'
                  ? 'border-[#00d4e0] bg-cyan-50/40 ring-2 ring-[#00d4e0]/20'
                  : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="integrationType"
                  checked={form.integrationType === 'full_journey'}
                  onChange={() => setForm({ ...form, integrationType: 'full_journey' })}
                  className="h-4 w-4 text-[#00d4e0] focus:ring-[#00d4e0]"
                />
                <span className="text-sm font-extrabold text-gray-900">Jornada Completa DuoLife (Full Digital)</span>
              </div>
              <p className="text-xs font-medium text-gray-600 mt-2 pl-6">
                A DuoLife cuida do processo ponta a ponta no Hub: Cadastro → Escolha do Plano → Assinatura Digital (ZapSign) → Cobrança (Asaas) → Emissão.
              </p>
            </div>

            <div
              onClick={() => setForm({ ...form, integrationType: 'external_link' })}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                form.integrationType === 'external_link'
                  ? 'border-purple-500 bg-purple-50/40 ring-2 ring-purple-500/20'
                  : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="integrationType"
                  checked={form.integrationType === 'external_link'}
                  onChange={() => setForm({ ...form, integrationType: 'external_link' })}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm font-extrabold text-gray-900">Link Direto de Contratação (External Link)</span>
              </div>
              <p className="text-xs font-medium text-gray-600 mt-2 pl-6">
                O produto direciona o parceiro ou cliente para um link externo específico de contratação na seguradora ou prestador parceiro.
              </p>
            </div>
          </div>

          {/* Campo condicional para Link Externo */}
          {form.integrationType === 'external_link' && (
            <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/30 space-y-2">
              <label className="block text-xs font-extrabold text-purple-900 uppercase tracking-wider">
                URL / Link Direto de Contratação Externa <span className="text-red-500">*</span>
              </label>
              <input
                required={form.integrationType === 'external_link'}
                type="url"
                className="w-full rounded-xl border border-purple-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all"
                value={form.externalLinkUrl}
                onChange={(e) => setForm({ ...form, externalLinkUrl: e.target.value })}
                placeholder="https://suaseguradora.com.br/contratar?ref=duolife"
              />
            </div>
          )}

          {/* Campos Técnicos da Jornada */}
          <div className="grid gap-4 md:grid-cols-3 items-center border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Prefixo da Apólice
              </label>
              <input
                disabled={!rcFlow}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 uppercase disabled:opacity-50 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.policyPrefix}
                onChange={(e) => setForm({ ...form, policyPrefix: e.target.value.toUpperCase() })}
                placeholder="DL-RC"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Vigência Padrão (Dias)
              </label>
              <input
                type="number"
                min="1"
                max="3650"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
                value={form.validityDays}
                onChange={(e) => setForm({ ...form, validityDays: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                id="renewalEnabled"
                className="h-4 w-4 rounded border-gray-300 text-[#00d4e0] focus:ring-[#00d4e0]"
                checked={form.renewalEnabled}
                onChange={(e) => setForm({ ...form, renewalEnabled: e.target.checked })}
              />
              <label htmlFor="renewalEnabled" className="text-xs font-bold text-gray-800 cursor-pointer">
                Permite renovação automática
              </label>
            </div>

            <div className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                id="requiresUnderwriting"
                className="h-4 w-4 rounded border-gray-300 text-[#00d4e0] focus:ring-[#00d4e0]"
                checked={form.requiresUnderwriting}
                onChange={(e) => setForm({ ...form, requiresUnderwriting: e.target.checked })}
              />
              <label htmlFor="requiresUnderwriting" className="text-xs font-bold text-gray-800 cursor-pointer">
                Exige análise técnica prévia
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Documentos Obrigatórios (Um por linha)
            </label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
              value={form.requiredDocumentsText}
              onChange={(e) => setForm({ ...form, requiredDocumentsText: e.target.value })}
              placeholder={'Comprovante de Inscrição CRM\nDocumento de Identidade\nFicha de Declaração de Saúde'}
            />
          </div>
        </div>

        {/* Seção 5: Disponibilidade para Parceiros */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-extrabold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-3">
            5. Disponibilidade para Parceiros
          </h2>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-800 cursor-pointer">
              <input
                type="radio"
                name="availability"
                className="h-4 w-4 text-[#00d4e0] focus:ring-[#00d4e0]"
                checked={form.availability === 'all_active'}
                onChange={() => setForm({ ...form, availability: 'all_active' })}
              />
              <span>Liberado para TODOS os parceiros ativos</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-gray-800 cursor-pointer">
              <input
                type="radio"
                name="availability"
                className="h-4 w-4 text-[#00d4e0] focus:ring-[#00d4e0]"
                checked={form.availability === 'selected'}
                onChange={() => setForm({ ...form, availability: 'selected' })}
              />
              <span>Escolher parceiros específicos</span>
            </label>
          </div>

          {form.availability === 'selected' && (
            <div className="mt-3 grid gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 md:grid-cols-3 max-h-56 overflow-y-auto">
              {partners.map((partner) => (
                <label key={partner.id} className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-[#00d4e0] focus:ring-[#00d4e0]"
                    checked={form.partnerIds.includes(partner.id)}
                    onChange={() => togglePartner(partner.id)}
                  />
                  <span className="truncate">{partner.nome_fantasia || partner.razao_social}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Ações Finais */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <Link
            href="/admin/produtos"
            className="px-5 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#0e4a5a] px-6 py-2.5 text-xs font-extrabold text-[#00d4e0] shadow-sm hover:bg-[#072a33] hover:text-white transition-all disabled:opacity-50"
          >
            {saving ? 'Cadastrando Produto...' : 'Salvar Novo Produto'}
          </button>
        </div>
      </form>
    </div>
  );
}
