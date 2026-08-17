'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Search,
  Filter,
  Eye,
  Shield,
  Briefcase,
  Users,
  ChevronRight,
  CheckCircle2,
  LockKeyhole,
} from 'lucide-react';

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

export default function ProdutosCatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  async function loadProducts() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/produtos');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.code.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term) ||
      (p.insurer_name && p.insurer_name.toLowerCase().includes(term));
    const matchesType = selectedType === 'all' || p.product_type === selectedType;
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesType && matchesCategory;
  });

  const insuranceCount = products.filter((p) => p.product_type === 'insurance').length;
  const serviceCount = products.filter((p) => p.product_type === 'service').length;

  return (
    <div className="space-y-6">
      {/* 1. Header no Container Oficial admin-hero-card */}
      <section className="admin-hero-card flex-row items-center justify-between">
        <div>
          <span className="admin-eyebrow">CATÁLOGO & CONFIGURAÇÃO DE COMERCIALIZAÇÃO</span>
          <h1 className="admin-page-title">Produtos e Serviços</h1>
          <p className="admin-page-copy">
            Painel exclusivo da administração para parametrização de produtos, comissionamento e split de repasses.
          </p>
        </div>

        <Link
          href="/admin/produtos/novo"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4e0] px-5 py-2.5 text-xs font-black text-[#072a33] shadow-xs hover:bg-[#00b8c4] transition-all shrink-0 uppercase tracking-wider"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Produto</span>
        </Link>
      </section>

      {/* Banner Informativo de Acesso Restrito ao Administrador */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-800">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
              Painel de Parâmetros Comerciais — Exclusivo para Administradores DuoLife
            </h3>
            <p className="text-xs text-amber-800 font-medium mt-0.5">
              Esta seção define como cada produto é comercializado no sistema, tabelas de planos e regras de repasse. Usuários e corretores finais não possuem acesso.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-amber-200/90 border border-amber-300 px-3 py-1 text-[11px] font-black uppercase text-amber-950">
          Gestão Restrita Admin
        </span>
      </div>

      {/* 2. Métrica Rápida do Catálogo */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="admin-metric-card">
          <div className="admin-metric-label">Total Cadastrados</div>
          <div className="admin-metric-value">{products.length}</div>
          <div className="admin-metric-hint">ofertas no sistema</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Seguros</div>
          <div className="admin-metric-value">{insuranceCount}</div>
          <div className="admin-metric-hint">apólices e coberturas</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Serviços</div>
          <div className="admin-metric-value">{serviceCount}</div>
          <div className="admin-metric-hint">soluções operacionais</div>
        </div>

        <div className="admin-metric-card">
          <div className="admin-metric-label">Categorias</div>
          <div className="admin-metric-value">{categories.length}</div>
          <div className="admin-metric-hint">segmentos ativos</div>
        </div>
      </section>

      {/* 3. Filtros e Busca */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-10 pr-4 py-2.5 text-xs font-semibold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#00d4e0] focus:ring-2 focus:ring-[#00d4e0]/20 focus:outline-none transition-all"
            placeholder="Buscar produto por nome, código, categoria ou seguradora..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            <select
              className="bg-transparent text-xs font-bold text-gray-800 focus:outline-none cursor-pointer"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all">Todos os tipos</option>
              <option value="insurance">Seguro</option>
              <option value="service">Serviço</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700">
            <select
              className="bg-transparent text-xs font-bold text-gray-800 focus:outline-none cursor-pointer"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">Todas as categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Lista em Tabela Padronizada */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-bold text-gray-400">Carregando catálogo de produtos...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Package className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-sm font-bold text-gray-700">Nenhum produto encontrado</p>
            <p className="text-xs text-gray-400">Tente ajustar os termos da sua pesquisa ou filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-black uppercase tracking-wider text-[#0e4a5a]">
                  <th className="px-5 py-3.5">Oferta / Produto</th>
                  <th className="px-5 py-3.5">Seguradora / Prestador</th>
                  <th className="px-5 py-3.5">Modalidade & Fluxo</th>
                  <th className="px-5 py-3.5">Comissão Base</th>
                  <th className="px-5 py-3.5">Parceiros Habilitados</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredProducts.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/admin/produtos/${p.id}`)}
                    className="hover:bg-gray-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <div className="font-extrabold text-gray-900 group-hover:text-[#0e4a5a] transition-colors">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-block rounded-md bg-cyan-50 border border-cyan-100 px-2 py-0.5 text-[10px] font-black text-[#0e4a5a] uppercase">
                          {p.code}
                        </span>
                        <span className="text-[11px] font-medium text-gray-500">{p.category}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-800">{p.insurer_name || 'KEV Seguros'}</div>
                      {p.insurer_cnpj && <div className="text-[10px] text-gray-400 font-mono">{p.insurer_cnpj}</div>}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                          p.integration_type === 'full_journey' || p.flow_key === 'rc_professional_v1'
                            ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                            : 'bg-purple-50 text-purple-800 border border-purple-200'
                        }`}
                      >
                        {p.integration_type === 'full_journey' || p.flow_key === 'rc_professional_v1' ? (
                          <Shield className="h-3 w-3 text-cyan-600" />
                        ) : (
                          <Briefcase className="h-3 w-3 text-purple-600" />
                        )}
                        {p.integration_type === 'full_journey' || p.flow_key === 'rc_professional_v1'
                          ? 'Jornada Completa'
                          : 'Link Direto'}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-bold text-gray-900">
                        {p.base_commission_rate ? `${p.base_commission_rate}%` : 'Sob consulta'}
                      </div>
                      {p.min_premium && (
                        <div className="text-[10px] text-gray-400 font-medium">
                          A partir de R$ {Number(p.min_premium).toFixed(2).replace('.', ',')}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-gray-700 font-semibold">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        <span>{p.partners_count} Parceiros</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {p.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/produtos/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-extrabold text-[#0e4a5a] hover:bg-gray-50 transition-all shadow-2xs"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#00d4e0]" />
                        <span>Ver Produto</span>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
