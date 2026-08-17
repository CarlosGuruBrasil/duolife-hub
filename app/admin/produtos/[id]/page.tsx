'use client';

import { FormEvent, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  FileText,
  Building2,
  Users,
  Percent,
  Calendar,
  CheckCircle2,
  Edit2,
  Save,
  Sliders,
  Sparkles,
  AlertCircle,
  Package,
  LockKeyhole,
  PieChart,
  DollarSign,
  Tag,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

function parseCurrency(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^\d,-]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Product = {
  id: string;
  name: string;
  code: string;
  category: string;
  product_type: string;
  integration_type?: string | null;
  external_link_url?: string | null;
  insurer_name: string | null;
  insurer_cnpj: string | null;
  description: string | null;
  public_title: string | null;
  target_audience: string | null;
  base_commission_rate: number | null;
  min_premium: number | null;
  flow_key: string;
  is_active: boolean;
  is_quoteable: boolean;
  validity_days: number | null;
  sale_recognition: string | null;
  renewal_enabled: boolean;
  requiresUnderwriting: boolean;
  required_documents: string[] | string | null;
  partners_count: number;
};

type PlanData = {
  id: string;
  wix_item_id: string;
  nomeExibido: string;
  tipoDePlano: string;
  cobertura: string;
  franquia: string;
  parcela: string;
  parcela2X: string;
  parcela3X: string;
  parcela4X: string;
  parcela6X: string;
  quantidadeDeParcelas: string;
  valorPagoKovr: number | null;
  ordem: number;
};

type CouponData = {
  id: string;
  codigo: string;
  nome: string;
  desconto: number;
  validade: string | null;
  cupomAtivo: boolean;
  quantidade: number;
  quantidadeUsada: number;
};

function parseDocs(docs: unknown): string[] {
  if (!docs) return [];
  if (Array.isArray(docs)) return docs.map(String);
  if (typeof docs === 'string') {
    try {
      const parsed = JSON.parse(docs);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
}
  return [];
}

const SPREADSHEET_EXACT_MATRIX: Record<
  number,
  { '1x': { kev: number; corr: number; est: number; adm: number }; '6x': { kev: number; corr: number; est: number; adm: number } }
> = {
  0: {
    '1x': { kev: 41.39, corr: 30.73, est: 13.04, adm: 14.84 },
    '6x': { kev: 38.59, corr: 28.69, est: 18.74, adm: 13.98 },
  },
  10: {
    '1x': { kev: 45.93, corr: 28.87, est: 11.18, adm: 14.02 },
    '6x': { kev: 42.87, corr: 26.95, est: 16.74, adm: 13.44 },
  },
  20: {
    '1x': { kev: 51.67, corr: 26.08, est: 9.31, adm: 12.94 },
    '6x': { kev: 48.24, corr: 24.34, est: 15.07, adm: 12.35 },
  },
  30: {
    '1x': { kev: 59.08, corr: 20.49, est: 8.38, adm: 12.05 },
    '6x': { kev: 55.13, corr: 13.04, est: 17.74, adm: 14.09 },
  },
  40: {
    '1x': { kev: 68.89, corr: 13.97, est: 6.52, adm: 10.62 },
    '6x': { kev: 64.31, corr: 13.04, est: 12.13, adm: 10.52 },
  },
};

export default function ProdutoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlanData | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Porcentagens do Split de Distribuição de Verba (Planilha Oficial DuoLife & KEV Seguros)
  const [splitKev, setSplitKev] = useState<number>(41.39);
  const [splitCorretor, setSplitCorretor] = useState<number>(30.73);
  const [splitEstipulante, setSplitEstipulante] = useState<number>(13.04);
  const [splitAdm, setSplitAdm] = useState<number>(14.84);

  // Cupons do Wix e Simulador de Desconto/Forma de Pagamento
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [selectedDiscount, setSelectedDiscount] = useState<number>(0);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('1x');

  // Estado para Gestão de Cupons (Modal CRUD)
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [couponForm, setCouponForm] = useState<{ codigo: string; desconto: number; validade: string; cupomAtivo: boolean }>({
    codigo: '',
    desconto: 10,
    validade: '',
    cupomAtivo: true,
  });
  const [savingCoupon, setSavingCoupon] = useState(false);

  function openCreateCouponModal() {
    setEditingCouponId(null);
    setCouponForm({ codigo: '', desconto: 10, validade: '', cupomAtivo: true });
    setCouponModalOpen(true);
  }

  function openEditCouponModal(coupon: CouponData) {
    setEditingCouponId(coupon.id);
    setCouponForm({
      codigo: coupon.codigo,
      desconto: coupon.desconto,
      validade: coupon.validade ? coupon.validade.split('T')[0] : '',
      cupomAtivo: coupon.cupomAtivo,
    });
    setCouponModalOpen(true);
  }

  async function handleSaveCoupon(e: FormEvent) {
    e.preventDefault();
    setSavingCoupon(true);
    try {
      if (editingCouponId) {
        const res = await fetch('/api/admin/produtos/cupons', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingCouponId,
            codigo: couponForm.codigo,
            desconto: couponForm.desconto,
            validade: couponForm.validade || undefined,
            cupomAtivo: couponForm.cupomAtivo,
          }),
        });

        if (res.ok) {
          setCouponModalOpen(false);
          setEditingCouponId(null);
          await loadData();
        } else {
          const data = await res.json();
          alert(data.error || 'Erro ao atualizar cupom');
        }
      } else {
        const res = await fetch('/api/admin/produtos/cupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: couponForm.codigo,
            desconto: couponForm.desconto,
            validade: couponForm.validade || undefined,
          }),
        });

        if (res.ok) {
          setCouponModalOpen(false);
          setCouponForm({ codigo: '', desconto: 10, validade: '', cupomAtivo: true });
          await loadData();
        } else {
          const data = await res.json();
          alert(data.error || 'Erro ao criar cupom');
        }
      }
    } catch (err) {
      console.error('Erro ao salvar cupom:', err);
    } finally {
      setSavingCoupon(false);
    }
  }

  async function handleDeleteCoupon(id: string, codigo: string) {
    if (!confirm(`Tem certeza que deseja excluir o cupom "${codigo}"?`)) return;
    try {
      const res = await fetch(`/api/admin/produtos/cupons?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await loadData();
      } else {
        alert('Erro ao excluir cupom');
      }
    } catch (err) {
      console.error('Erro ao excluir cupom:', err);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [prodRes, plansRes, couponsRes] = await Promise.all([
        fetch('/api/admin/produtos'),
        fetch('/api/admin/produtos/planos'),
        fetch('/api/admin/produtos/cupons'),
      ]);

      const prodData = await prodRes.json();
      const plansData = await plansRes.json();
      const couponsData = await couponsRes.json();

      if (prodRes.ok && prodData.products) {
        const found = prodData.products.find(
          (p: Product) => p.id === productId || p.code.toLowerCase() === productId.toLowerCase()
        );
        setProduct(found || prodData.products[0] || null);
      }

      if (plansRes.ok && plansData.plans) {
        setPlans(plansData.plans);
      }

      if (couponsRes.ok && couponsData.coupons) {
        setCoupons(couponsData.coupons);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do produto:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [productId]);

  function startEditPlan(plan: PlanData) {
    setEditingPlanId(plan.id);
    setEditForm({ ...plan });
    setSaveSuccess(false);
  }

  function cancelEditPlan() {
    setEditingPlanId(null);
    setEditForm(null);
  }

  async function handleSavePlan(e: FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setSavingPlan(true);
    try {
      const res = await fetch('/api/admin/produtos/planos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setEditingPlanId(null);
        setEditForm(null);
        await loadData();
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar plano:', err);
    } finally {
      setSavingPlan(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="h-8 bg-gray-200 rounded-xl w-48 animate-pulse" />
        <div className="h-40 bg-gray-200 rounded-3xl animate-pulse" />
        <div className="h-96 bg-gray-200 rounded-3xl animate-pulse" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
        <h1 className="text-xl font-extrabold text-gray-900">Produto Não Encontrado</h1>
        <Link
          href="/admin/produtos"
          className="inline-flex items-center gap-2 text-xs font-black text-[#072a33] bg-[#00d4e0] px-5 py-2.5 rounded-xl shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar aos Produtos
        </Link>
      </div>
    );
  }

  const requiredDocs = parseDocs(product.required_documents);

  return (
    <div className="space-y-6">
      {/* 1. Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">DETALHES DO PRODUTO</span>
          <h1 className="admin-page-title">{product.name}</h1>
          <p className="admin-page-copy">
            {product.description || 'Seguro de Responsabilidade Civil Profissional para Advogados.'}
          </p>
        </div>

        <Link
          href="/admin/produtos"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-gray-200/80 px-4 py-2.5 text-xs font-black text-gray-700 hover:bg-gray-50 shadow-2xs transition-all shrink-0 uppercase tracking-wider"
        >
          <ArrowLeft className="h-4 w-4 text-[#00d4e0]" />
          <span>Voltar aos Produtos</span>
        </Link>
      </section>

      {/* 2. Métricas Padronizadas em Cards de 4 Colunas */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="admin-metric-card tone-success">
          <div className="admin-metric-label">Comissão Base</div>
          <div className="admin-metric-value">
            {product.base_commission_rate != null ? `${product.base_commission_rate}%` : '15%'}
          </div>
          <div className="admin-metric-hint">repasse padrão parceiros</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Prêmio Mínimo</div>
          <div className="admin-metric-value">
            {product.min_premium != null ? `R$ ${Number(product.min_premium).toFixed(2).replace('.', ',')}` : 'R$ 516,67'}
          </div>
          <div className="admin-metric-hint">menor parcela de apólice</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Vigência Padrão</div>
          <div className="admin-metric-value">
            {product.validity_days ? `${product.validity_days} dias` : '365 dias'}
          </div>
          <div className="admin-metric-hint">validade da cobertura</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Parceiros Operando</div>
          <div className="admin-metric-value">
            {product.partners_count}
          </div>
          <div className="admin-metric-hint">corretoras habilitadas</div>
        </div>
      </section>

      {/* Banner Informativo de Acesso Restrito a Administradores */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-800">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
              Configuração Exclusiva para Administradores
            </h3>
            <p className="text-xs text-amber-800 font-medium mt-0.5">
              Definição de regras de venda, cálculo de taxas de repasse (KEV, Corretor, Estipulante, ADM DuoLife) e planos habilitados na plataforma.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-200/90 border border-amber-300 px-3 py-1 text-[11px] font-black uppercase text-amber-950">
          Painel Administrativo
        </span>
      </div>

      {/* 3. Resumo da Seguradora Garantidora */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0e4a5a]/10 text-[#0e4a5a]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Seguradora Garantidora</span>
            <div className="text-sm font-extrabold text-gray-900">{product.insurer_name || 'KEV Seguros'}</div>
            {product.insurer_cnpj && <div className="text-[11px] font-mono text-gray-500">CNPJ: {product.insurer_cnpj}</div>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 border border-cyan-100 px-3 py-1 text-xs font-bold text-[#0e4a5a] uppercase">
            <Shield className="h-3.5 w-3.5 text-[#00d4e0]" />
            {product.code}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 uppercase">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {product.integration_type === 'full_journey' ? 'Jornada Completa' : 'Link Direto'}
          </span>
        </div>
      </div>

      {/* 4. SEÇÃO PRINCIPAL: TABELA PADRONIZADA DE PLANOS RC ADVOGADOS */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[#0e4a5a]" /> Tabela Oficial de Planos & Coberturas RC Advogados
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Acompanhe e edite os valores das 7 faixas de cobertura (R$ 100k até R$ 3 Milhões), franquia e parcelamento integrado.
            </p>
          </div>

          {saveSuccess && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-extrabold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Alterações salvas com sucesso!
            </div>
          )}
        </div>

        {/* Tabela de Planos no Padrão do Sistema */}
        <div className="overflow-x-auto rounded-xl border border-gray-200/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-black uppercase tracking-wider text-[#0e4a5a]">
                <th className="px-5 py-3.5">Faixa de Plano</th>
                <th className="px-5 py-3.5">Limite de Cobertura</th>
                <th className="px-5 py-3.5">Franquia</th>
                <th className="px-5 py-3.5">Valor À Vista (1x)</th>
                <th className="px-5 py-3.5">Parcelamento (2x a 6x)</th>
                <th className="px-5 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {plans.map((plan) => {
                const isEditing = editingPlanId === plan.id;

                if (isEditing && editForm) {
                  return (
                    <tr key={plan.id} className="bg-cyan-50/50 border-2 border-[#00d4e0]">
                      <td className="px-5 py-5" colSpan={6}>
                        <form onSubmit={handleSavePlan} className="space-y-4">
                          <div className="flex items-center justify-between border-b border-cyan-200/60 pb-2">
                            <span className="text-xs font-black uppercase text-[#0e4a5a]">
                              Editando Plano: {plan.nomeExibido} ({plan.cobertura})
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={cancelEditPlan}
                                className="px-3.5 py-1.5 rounded-xl border border-gray-200 bg-white font-bold text-gray-700 hover:bg-gray-100"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                disabled={savingPlan}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#0e4a5a] text-[#00d4e0] font-extrabold hover:bg-[#072a33] transition-all disabled:opacity-50 shadow-xs"
                              >
                                <Save className="h-3.5 w-3.5" />
                                {savingPlan ? 'Salvando...' : 'Salvar Alterações'}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Nome</label>
                              <input
                                required
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.nomeExibido}
                                onChange={(e) => setEditForm({ ...editForm, nomeExibido: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Cobertura</label>
                              <input
                                required
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.cobertura}
                                onChange={(e) => setEditForm({ ...editForm, cobertura: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Franquia</label>
                              <input
                                required
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.franquia}
                                onChange={(e) => setEditForm({ ...editForm, franquia: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">À Vista (1x)</label>
                              <input
                                required
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.parcela}
                                onChange={(e) => setEditForm({ ...editForm, parcela: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Parcela 2x</label>
                              <input
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.parcela2X}
                                onChange={(e) => setEditForm({ ...editForm, parcela2X: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Parcela 3x</label>
                              <input
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.parcela3X}
                                onChange={(e) => setEditForm({ ...editForm, parcela3X: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Parcela 4x</label>
                              <input
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.parcela4X}
                                onChange={(e) => setEditForm({ ...editForm, parcela4X: e.target.value })}
                              />
                            </div>

                            <div>
                              <label className="block font-extrabold text-gray-700 uppercase mb-1">Parcela 6x</label>
                              <input
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-bold text-gray-900 focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none"
                                value={editForm.parcela6X}
                                onChange={(e) => setEditForm({ ...editForm, parcela6X: e.target.value })}
                              />
                            </div>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={plan.id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="font-extrabold text-gray-900 group-hover:text-[#0e4a5a] transition-colors">
                        {plan.nomeExibido}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400">Tipo: {plan.tipoDePlano}</div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-block rounded-md bg-cyan-50 border border-cyan-100 px-2 py-0.5 text-[10px] font-black text-[#0e4a5a] uppercase">
                        {plan.cobertura}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-semibold text-gray-700">{plan.franquia}</td>

                    <td className="px-5 py-4 font-extrabold text-gray-900">{plan.parcela}</td>

                    <td className="px-5 py-4 text-gray-600 font-medium space-y-0.5">
                      {plan.parcela2X && <div>2x de {plan.parcela2X}</div>}
                      {plan.parcela3X && <div>3x de {plan.parcela3X}</div>}
                      {plan.parcela4X && <div>4x de {plan.parcela4X}</div>}
                      {plan.parcela6X && <div className="font-bold text-gray-800">6x de {plan.parcela6X}</div>}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => startEditPlan(plan)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-extrabold text-[#0e4a5a] hover:bg-gray-50 transition-all shadow-2xs"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-[#00d4e0]" /> Editar Plano
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. TABELA OFICIAL DE DISTRIBUIÇÃO DE VALORES & REPASSES (SPLIT DINÂMICO POR PLANO, CUPOM E FORMA DE PAGAMENTO) */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <PieChart className="h-4.5 w-4.5 text-[#00d4e0]" /> Matriz de Repasses & Split Efetivo de Comissionamento
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Simule a variação real da % e R$ do Corretor conforme o cupom de desconto (0%, 10%, 20%, 30%, 40%) e forma de pagamento.
            </p>
          </div>

          {/* Seletor de Cupom e Forma de Pagamento */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs">
              <span className="font-extrabold text-[#0e4a5a] text-[11px] uppercase">Cupom:</span>
              <select
                value={selectedDiscount}
                onChange={(e) => setSelectedDiscount(Number(e.target.value))}
                className="bg-transparent font-extrabold text-gray-900 focus:outline-none cursor-pointer"
              >
                <option value={0}>Sem Desconto (Tabela Cheia)</option>
                <option value={10}>Cupom 10% OFF (bonus10 / SITE5)</option>
                <option value={20}>Cupom 20% OFF (bonus20)</option>
                <option value={30}>Cupom 30% OFF (bonus30 / caamg30)</option>
                <option value={40}>Cupom 40% OFF (bonus40 / caadf40)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs">
              <span className="font-extrabold text-[#0e4a5a] text-[11px] uppercase">Pagamento:</span>
              <select
                value={selectedPaymentMode}
                onChange={(e) => setSelectedPaymentMode(e.target.value)}
                className="bg-transparent font-extrabold text-gray-900 focus:outline-none cursor-pointer"
              >
                <option value="1x">À Vista (1x)</option>
                <option value="2x">2x sem juros</option>
                <option value="3x">3x sem juros</option>
                <option value="4x">4x sem juros</option>
                <option value="6x">6x (com juros cartão 2%)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notificação Explicativa da Variação da Comissão e Forma de Pagamento */}
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3.5 flex items-center justify-between text-xs text-[#0e4a5a] font-medium flex-wrap gap-2">
          <span>
            💡 <strong>Matriz Dinâmica:</strong> Exibindo valores calculados para modalidade <strong>{selectedPaymentMode === '6x' ? '6x com Juros (2% a.m.)' : selectedPaymentMode}</strong> {selectedDiscount > 0 ? `com Cupom de ${selectedDiscount}% OFF` : 'na Tabela Cheia'}. O custo da KEV Seguros é fixo e a comissão do corretor é recalculada sobre o valor final cobrado.
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5">Plano / Cobertura</th>
                <th className="px-5 py-3.5">Prêmio Tabela</th>
                <th className="px-5 py-3.5">Valor Total Cobrado</th>
                <th className="px-5 py-3.5">KEV Seguros (Fixo)</th>
                <th className="px-5 py-3.5 text-emerald-800">Comissão Corretor</th>
                <th className="px-5 py-3.5">Estipulante</th>
                <th className="px-5 py-3.5">ADM DuoLife</th>
                <th className="px-5 py-3.5 text-right">Total Repassado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {plans.map((plan) => {
                // 1. Determina o valor base conforme forma de pagamento (1x, 2x, 3x, 4x, 6x)
                let baseVal = parseCurrency(plan.parcela);
                let installmentText = '1x À Vista';

                if (selectedPaymentMode === '6x' && plan.parcela6X) {
                  const p6 = parseCurrency(plan.parcela6X);
                  if (p6 > 0) {
                    baseVal = p6 * 6;
                    installmentText = `6x de ${formatCurrency(p6)}`;
                  }
                } else if (selectedPaymentMode === '4x' && plan.parcela4X) {
                  const p4 = parseCurrency(plan.parcela4X);
                  if (p4 > 0) {
                    baseVal = p4 * 4;
                    installmentText = `4x de ${formatCurrency(p4)}`;
                  }
                } else if (selectedPaymentMode === '3x' && plan.parcela3X) {
                  const p3 = parseCurrency(plan.parcela3X);
                  if (p3 > 0) {
                    baseVal = p3 * 3;
                    installmentText = `3x de ${formatCurrency(p3)}`;
                  }
                } else if (selectedPaymentMode === '2x' && plan.parcela2X) {
                  const p2 = parseCurrency(plan.parcela2X);
                  if (p2 > 0) {
                    baseVal = p2 * 2;
                    installmentText = `2x de ${formatCurrency(p2)}`;
                  }
                }

                // 2. Aplica o cupom de desconto comercial (0%, 10%, 20%, 30%, 40%)
                const discountFactor = (100 - selectedDiscount) / 100;
                const clientPaidVal = baseVal * discountFactor;

                // 3. Matriz Efetiva de Porcentagens Extraída Diretamente das 5 Abas da Planilha Oficial Google
                const modeKey = selectedPaymentMode === '6x' ? '6x' : '1x';
                const currentTabRates = SPREADSHEET_EXACT_MATRIX[selectedDiscount]?.[modeKey] || SPREADSHEET_EXACT_MATRIX[0][modeKey];

                const kevEffPct = currentTabRates.kev;
                const corrEffPct = currentTabRates.corr;
                const estEffPct = currentTabRates.est;
                const admEffPct = currentTabRates.adm;

                const kevCostFixed = clientPaidVal * (kevEffPct / 100);
                const corrVal = clientPaidVal * (corrEffPct / 100);
                const estVal = clientPaidVal * (estEffPct / 100);
                const admVal = clientPaidVal * (admEffPct / 100);

                return (
                  <tr key={plan.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-slate-900 block">{plan.nomeExibido}</span>
                      <span className="text-xs text-slate-500 font-normal block">{plan.cobertura}</span>
                    </td>

                    <td className="px-5 py-4 text-xs font-normal text-slate-400 line-through">{plan.parcela}</td>

                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-slate-900 block">{formatCurrency(clientPaidVal)}</span>
                      <span className="text-xs text-slate-500 font-medium block">{installmentText}</span>
                      {selectedDiscount > 0 && (
                        <span className="text-xs text-emerald-700 font-semibold block">-{selectedDiscount}% OFF</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-slate-900 block">{formatCurrency(kevCostFixed)}</span>
                      <span className="text-xs text-slate-500 font-normal block">{kevEffPct.toFixed(2)}% efetivo</span>
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-emerald-700 block">{formatCurrency(corrVal)}</span>
                      <span className="text-xs text-emerald-600 font-medium block">{corrEffPct.toFixed(2)}% efetivo</span>
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-slate-900 block">{formatCurrency(estVal)}</span>
                      <span className="text-xs text-slate-500 font-normal block">{estEffPct.toFixed(2)}% efetivo</span>
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-slate-900 block">{formatCurrency(admVal)}</span>
                      <span className="text-xs text-slate-500 font-normal block">{admEffPct.toFixed(2)}% efetivo</span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span className="text-sm font-semibold text-slate-900 block">{formatCurrency(clientPaidVal)}</span>
                      <span className="text-xs text-slate-500 font-medium block">100.00%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. GESTÃO COMPLETA DE CUPONS DE DESCONTO HABILITADOS NO SISTEMA */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Tag className="h-4.5 w-4.5 text-[#00d4e0]" /> Cupons Promocionais Habilitados no Sistema ({coupons.length})
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Adicione, edite e ative/desative cupons de desconto (10%, 20%, 30%, 40%) cadastrados.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateCouponModal}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0e4a5a] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#072a33] transition-all shadow-xs shrink-0"
          >
            <Plus className="h-4 w-4" /> Novo Cupom
          </button>
        </div>

        {/* Grid de Cards de Cupons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {coupons.map((coupon) => (
            <div
              key={coupon.id}
              className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 hover:border-gray-300 hover:shadow-2xs transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gray-900 uppercase">
                  {coupon.codigo}
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                  {coupon.desconto}% OFF
                </span>
              </div>

              <div className="text-xs text-gray-500 font-medium flex items-center justify-between pt-2 border-t border-gray-100">
                <span>Status: <strong className={coupon.cupomAtivo ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}>{coupon.cupomAtivo ? 'Ativo' : 'Inativo'}</strong></span>
                <span>Usos: <strong className="text-gray-900 font-semibold">{coupon.quantidadeUsada}</strong></span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => openEditCouponModal(coupon)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all"
                >
                  <Edit2 className="h-3.5 w-3.5 text-cyan-600" /> Editar
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteCoupon(coupon.id, coupon.codigo)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL DIALOG CENTRADO PARA CRIAR/EDITAR CUPOM */}
      {couponModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Tag className="h-4.5 w-4.5 text-[#00d4e0]" />
                {editingCouponId ? 'Editar Cupom Promocional' : 'Novo Cupom Promocional'}
              </h3>
              <button
                type="button"
                onClick={() => setCouponModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Código do Cupom</label>
                <input
                  required
                  placeholder="ex: bonus50"
                  value={couponForm.codigo}
                  onChange={(e) => setCouponForm({ ...couponForm, codigo: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 font-bold text-gray-900 focus:border-[#0e4a5a] focus:ring-1 focus:ring-[#0e4a5a] focus:outline-none uppercase text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Desconto (%)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={couponForm.desconto}
                  onChange={(e) => setCouponForm({ ...couponForm, desconto: Number(e.target.value) })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 font-bold text-gray-900 focus:border-[#0e4a5a] focus:ring-1 focus:ring-[#0e4a5a] focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Validade (Opcional)</label>
                <input
                  type="date"
                  value={couponForm.validade}
                  onChange={(e) => setCouponForm({ ...couponForm, validade: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 font-bold text-gray-900 focus:border-[#0e4a5a] focus:ring-1 focus:ring-[#0e4a5a] focus:outline-none text-xs"
                />
              </div>

              {editingCouponId && (
                <div className="pt-1">
                  <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={couponForm.cupomAtivo}
                      onChange={(e) => setCouponForm({ ...couponForm, cupomAtivo: e.target.checked })}
                      className="rounded border-gray-300 text-[#0e4a5a] focus:ring-[#0e4a5a] h-4 w-4"
                    />
                    <span>Cupom Ativo no Sistema</span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCouponModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCoupon}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0e4a5a] text-white text-xs font-bold hover:bg-[#072a33] transition-all disabled:opacity-50 shadow-xs"
                >
                  <Save className="h-4 w-4" />
                  {savingCoupon ? 'Salvando...' : 'Salvar Cupom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Documentos Exigidos */}
      {requiredDocs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-[#0e4a5a] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#00d4e0]" /> Documentos Exigidos para Contratação
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {requiredDocs.map((doc, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-semibold text-gray-700"
              >
                <FileText className="h-3.5 w-3.5 text-cyan-600" />
                {doc}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
