'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Eye,
  Edit3,
  Download,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Save,
  RotateCcw,
  ExternalLink,
  Code2,
  FileCheck,
} from 'lucide-react';
import { ContractA4Sheet, RcAdvogadoContractTemplate } from '@/components/contracts';
import type { ContractData } from '@/types/contract';

interface TemplateItem {
  id: string;
  slug: string;
  ramoId: string;
  nome: string;
  descricao?: string;
  versao: number;
  ativo: boolean;
  titulo: string;
  subtitulo?: string;
  declaracaoTexto: string;
  updatedAt: string;
}

const MOCK_PREVIEW_DATA: ContractData = {
  proponente: {
    nome: 'Dr. Carlos Eduardo Santos de Souza',
    dataNascimento: '14/08/1988',
    cpf: '123.456.789-00',
    email: 'carlos.advocacia@exemplo.com.br',
    celular: '(11) 98765-4321',
    endereco: 'Av. Paulista, 1000, Cj. 101 - Bela Vista, São Paulo - SP, CEP 01310-100',
    inicioProfissional: '12/03/2012',
    oab: '123456/SP',
  },
  condicoes: {
    importanciaSegurada: 'R$ 100.000,00',
    franquia: 'Não há aplicação de franquia',
    valorPremio: 'R$ 790,00',
    formaPagamento: '1 parcela de R$ 790,00 à vista',
    vigencia: '1 ano',
    estipulante: 'DUOLIFE PLATAFORMA DE NEGÓCIOS',
    corretora: 'DuoLife Corretora de Seguros',
    seguradora: 'AKAD SEGUROS S.A.',
  },
  corretora: {
    nome: 'DuoLife Corretora de Seguros',
    nomeFantasia: 'DuoLife Corretora de Seguros',
    cidade: 'São Paulo',
    estado: 'SP',
  },
  dataCidade: {
    cidade: 'São Paulo',
    dia: 26,
    mes: 'Outubro',
    ano: 2026,
  },
  usePlaceholders: false,
};

export default function ContratosPage() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Campos do editor
  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [declaracaoTexto, setDeclaracaoTexto] = useState('');
  const [usePlaceholders, setUsePlaceholders] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/contratos/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Erro ao buscar templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (tmpl: TemplateItem) => {
    setEditingTemplate(tmpl);
    setTitulo(tmpl.titulo || '');
    setSubtitulo(tmpl.subtitulo || '');
    setDeclaracaoTexto(tmpl.declaracaoTexto || '');
    setToastMessage(null);
  };

  const handleSave = async () => {
    if (!editingTemplate) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/admin/contratos/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          subtitulo,
          declaracaoTexto,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Falha ao salvar template');
      }

      const updated = await res.json();
      setToastMessage({ type: 'success', text: `Template salvo com sucesso! Versão v${updated.template.versao}` });
      fetchTemplates();
    } catch (err: any) {
      setToastMessage({ type: 'error', text: err.message || 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-[#0e4a5a]" />
            Contratos & Minutas Dinâmicas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie o conteúdo, cláusulas legais e termos de adesão timbrados com renderização HTML/Tailwind e conversão PDF para ZapSign.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/contratos/preview"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition"
          >
            <Eye className="w-4 h-4 text-gray-600" />
            Visualizar Folha A4
          </Link>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Editor Split-Screen ou Lista */}
      {editingTemplate ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium transition"
              >
                ← Voltar à Lista
              </button>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Editando Minuta: {editingTemplate.nome}
                </span>
                <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-mono">
                  v{editingTemplate.versao}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUsePlaceholders(!usePlaceholders)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition ${
                  usePlaceholders
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                {usePlaceholders ? 'Tags {{...}} Ativas' : 'Dados Reais'}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-[#0e4a5a] hover:bg-[#0c3f4d] rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>

          {/* Grid Split-Screen */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Painel Esquerdo: Formulário de Edição */}
            <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#0e4a5a]" />
                Campos e Textos do Contrato
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Título Principal do Documento
                  </label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/20 focus:border-[#0e4a5a]"
                    placeholder="Ex: Seguro de Responsabilidade Civil para Advogado"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Subtítulo do Documento
                  </label>
                  <input
                    type="text"
                    value={subtitulo}
                    onChange={(e) => setSubtitulo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/20 focus:border-[#0e4a5a]"
                    placeholder="Ex: Termo de Adesão por parte do Advogado"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Texto da Declaração do Proponente
                    </label>
                    <span className="text-[10px] text-gray-500">
                      {declaracaoTexto.length} caracteres
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={declaracaoTexto}
                    onChange={(e) => setDeclaracaoTexto(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e4a5a]/20 focus:border-[#0e4a5a] font-sans leading-relaxed"
                    placeholder="Insira as cláusulas e declarações do segurado..."
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    O texto se adapta automaticamente à folha sem quebrar coordenadas ou sobrepor tabelas.
                  </p>
                </div>

                {/* Variáveis Dinâmicas Disponíveis */}
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <span className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Tags Dinâmicas Disponíveis:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '{{nome_cliente}}',
                      '{{cpf}}',
                      '{{email}}',
                      '{{celular}}',
                      '{{oab}}',
                      '{{tipo}}',
                      '{{valor}}',
                      '{{franquia}}',
                      '{{corretora}}',
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setDeclaracaoTexto((prev) => `${prev} ${tag}`)}
                        className="text-[10px] bg-white border border-gray-300 text-gray-700 hover:border-[#0e4a5a] hover:text-[#0e4a5a] px-2 py-0.5 rounded font-mono transition"
                        title="Clique para adicionar ao final do texto"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Painel Direito: Live Preview da Folha A4 */}
            <div className="lg:col-span-7 bg-slate-100 p-4 rounded-xl border border-gray-300 flex flex-col items-center justify-start overflow-x-auto min-h-[600px]">
              <div className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Pré-visualização em Tempo Real (Folha A4 Timbrada)
              </div>

              {/* Contêiner da Folha com escala proporcional */}
              <div className="w-[210mm] shadow-2xl rounded-sm border border-slate-300 origin-top scale-[0.72] sm:scale-[0.80] md:scale-[0.88] xl:scale-[0.92] transition-transform">
                <ContractA4Sheet
                  backgroundUrl="/images/contrato-kev/kev-background.jpg"
                  corretora={{
                    nome: 'Net4life Seguros',
                    nomeFantasia: 'Net4life Seguros',
                    logoUrl: '/images/corretoras/net4life-logo.png',
                    cidade: 'São Paulo',
                    estado: 'SP',
                  }}
                >
                  <RcAdvogadoContractTemplate
                    data={MOCK_PREVIEW_DATA}
                    forcePlaceholders={usePlaceholders}
                    customTitulo={titulo}
                    customSubtitulo={subtitulo}
                    customDeclaracaoTexto={declaracaoTexto}
                  />
                </ContractA4Sheet>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Lista de Contratos Cadastrados */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full py-12 text-center text-gray-500 text-sm">
              Carregando modelos de contrato...
            </div>
          ) : templates.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-white rounded-xl border border-gray-200">
              <FileCheck className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">Nenhum modelo cadastrado</p>
            </div>
          ) : (
            templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:-translate-y-1 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0e4a5a] bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                      {tmpl.ramoId}
                    </span>
                    <span className="text-xs font-mono font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                      v{tmpl.versao}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-gray-900 line-clamp-1 mb-1">
                    {tmpl.nome}
                  </h3>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                    {tmpl.subtitulo || tmpl.titulo}
                  </p>

                  <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 mb-4 text-[11px] text-gray-600 line-clamp-3 italic">
                    &ldquo;{tmpl.declaracaoTexto}&rdquo;
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(tmpl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0e4a5a] bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar Conteúdo
                  </button>

                  <Link
                    href="/admin/contratos/preview"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview A4
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
