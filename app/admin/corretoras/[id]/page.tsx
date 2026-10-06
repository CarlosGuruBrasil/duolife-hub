'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Building, ShieldCheck, Mail, Phone, MapPin, Users, Briefcase,
  ExternalLink, Globe, Save, CheckCircle, Upload, Trash2, Image as ImageIcon,
  Landmark, FileText, FileCheck, Download, UserCheck, CreditCard, AlertCircle
} from 'lucide-react';
import type { WhiteLabelConfig } from '@/lib/white-label';
import { toast } from '@/components/ui/toast';
import { BANCOS_BRASILEIROS } from '../page';
import { maskCnpj, maskPhone, maskCpfCnpj } from '@/components/modals/masks';

interface CorretoraDetail {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string | null;
  susep: string | null;
  email: string;
  phone: string | null;
  telefone_cadastro?: string | null;
  socio_nome?: string | null;
  socio_cpf?: string | null;
  socio_rg?: string | null;
  socio_email?: string | null;
  socio_telefone?: string | null;
  socios_adicionais?: Array<Record<string, unknown>> | null;
  address: Record<string, string>;
  status: string;
  logo_base64?: string | null;
  logo_mime_type?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  pix_tipo_chave?: string | null;
  pix_chave?: string | null;
  contrato_social_mime_type?: string | null;
  contrato_social_nome_arquivo?: string | null;
  contrato_social_uploaded_at?: string | null;
  has_contrato_social?: boolean;
  cartao_cnpj_mime_type?: string | null;
  cartao_cnpj_nome_arquivo?: string | null;
  cartao_cnpj_uploaded_at?: string | null;
  has_cartao_cnpj?: boolean;
  socio_documento_mime_type?: string | null;
  socio_documento_nome_arquivo?: string | null;
  socio_documento_uploaded_at?: string | null;
  has_socio_documento?: boolean;
  comprovante_bancario_mime_type?: string | null;
  comprovante_bancario_nome_arquivo?: string | null;
  comprovante_bancario_uploaded_at?: string | null;
  has_comprovante_bancario?: boolean;
  created_at: string;
  whiteLabel: WhiteLabelConfig;
}

interface PartnerItem {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  person_type: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
}

interface Stats {
  total_parceiros: number;
  total_cotacoes: number;
  total_vendas: number;
  volume_vendas: number;
}

interface PendingFileDoc {
  base64: string;
  mime: string;
  name: string;
}

function formatarCpf(cpf: string | null): string {
  if (!cpf) return '-';
  const n = cpf.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return cpf;
}

export default function AdminCorretoraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [corretora, setCorretora] = useState<CorretoraDetail | null>(null);
  const [parceiros, setParceiros] = useState<PartnerItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form de edição
  const [form, setForm] = useState({
    razao_social: '',
    nome_fantasia: '',
    susep: '',
    email: '',
    phone: '',
    telefone_cadastro: '',
    socio_nome: '',
    socio_cpf: '',
    socio_rg: '',
    socio_email: '',
    socio_telefone: '',
    banco: '',
    agencia: '',
    conta: '',
    pix_tipo_chave: 'cnpj',
    pix_chave: '',
    primaryColor: '#004172',
    secondaryColor: '#002B4D',
  });

  const [bancoCustom, setBancoCustom] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBase64ToSave, setLogoBase64ToSave] = useState<string | null | undefined>(undefined);
  const [logoMimeTypeToSave, setLogoMimeTypeToSave] = useState<string | null | undefined>(undefined);

  // Estados dos 4 documentos para salvar (undefined = sem alteração; null = remover; objeto = novo arquivo)
  const [contratoFileToSave, setContratoFileToSave] = useState<PendingFileDoc | null | undefined>(undefined);
  const [cartaoCnpjFileToSave, setCartaoCnpjFileToSave] = useState<PendingFileDoc | null | undefined>(undefined);
  const [socioDocFileToSave, setSocioDocFileToSave] = useState<PendingFileDoc | null | undefined>(undefined);
  const [comprovanteBancarioFileToSave, setComprovanteBancarioFileToSave] = useState<PendingFileDoc | null | undefined>(undefined);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/corretoras/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCorretora(data.corretora);
      setParceiros(data.parceiros ?? []);
      setStats(data.stats ?? null);

      const isKnownBank = BANCOS_BRASILEIROS.includes(data.corretora.banco || '');
      setForm({
        razao_social: data.corretora.razao_social || '',
        nome_fantasia: data.corretora.nome_fantasia || '',
        susep: data.corretora.susep || '',
        email: data.corretora.email || '',
        phone: data.corretora.phone || '',
        telefone_cadastro: data.corretora.telefone_cadastro || '',
        socio_nome: data.corretora.socio_nome || '',
        socio_cpf: data.corretora.socio_cpf ? maskCpfCnpj(data.corretora.socio_cpf) : '',
        socio_rg: data.corretora.socio_rg || '',
        socio_email: data.corretora.socio_email || '',
        socio_telefone: data.corretora.socio_telefone ? maskPhone(data.corretora.socio_telefone) : '',
        banco: data.corretora.banco ? (isKnownBank ? data.corretora.banco : 'Outro (informar código/nome)') : '',
        agencia: data.corretora.agencia || '',
        conta: data.corretora.conta || '',
        pix_tipo_chave: data.corretora.pix_tipo_chave || 'cnpj',
        pix_chave: data.corretora.pix_chave || '',
        primaryColor: data.corretora.whiteLabel?.primaryColor || '#004172',
        secondaryColor: data.corretora.whiteLabel?.secondaryColor || '#002B4D',
      });
      setBancoCustom(data.corretora.banco && !isKnownBank ? data.corretora.banco : '');

      const initialLogo = data.corretora.logo_base64 && data.corretora.logo_mime_type
        ? `data:${data.corretora.logo_mime_type};base64,${data.corretora.logo_base64}`
        : (data.corretora.whiteLabel?.logoUrl || null);
      setLogoPreview(initialLogo);
      setLogoBase64ToSave(undefined);
      setLogoMimeTypeToSave(undefined);

      setContratoFileToSave(undefined);
      setCartaoCnpjFileToSave(undefined);
      setSocioDocFileToSave(undefined);
      setComprovanteBancarioFileToSave(undefined);
    } catch {
      setCorretora(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('O logotipo excede o limite máximo permitido de 2MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem válido (PNG, JPEG ou WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoPreview(result);
      setLogoBase64ToSave(result);
      setLogoMimeTypeToSave(file.type);
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogoPreview(null);
    setLogoBase64ToSave(null);
    setLogoMimeTypeToSave(null);
  }

  function handleGenericDocChange(
    file: File,
    label: string,
    setFileState: (doc: PendingFileDoc) => void
  ) {
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error(`O arquivo de ${label} excede o limite máximo permitido de 10MB.`);
      return;
    }

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf');
    if (!allowedTypes.includes(file.type) && !isPdfByName) {
      toast.error(`Selecione um arquivo de ${label} em PDF ou Imagem (PNG, JPEG).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFileState({
        base64: result,
        mime: file.type || 'application/pdf',
        name: file.name,
      });
      toast.success(`${label} selecionado para atualização.`);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const bancoFinal = form.banco === 'Outro (informar código/nome)' ? bancoCustom.trim() : form.banco.trim();

      const payload: Record<string, unknown> = {
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia,
        susep: form.susep,
        email: form.email,
        phone: form.phone,
        telefone_cadastro: form.telefone_cadastro,
        socio_nome: form.socio_nome,
        socio_cpf: form.socio_cpf,
        socio_rg: form.socio_rg,
        socio_email: form.socio_email,
        socio_telefone: form.socio_telefone,
        banco: bancoFinal,
        agencia: form.agencia.trim(),
        conta: form.conta.trim(),
        pix_tipo_chave: form.pix_tipo_chave,
        pix_chave: form.pix_chave.trim(),
        whiteLabel: {
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
        },
      };

      if (logoBase64ToSave !== undefined) {
        payload.logo_base64 = logoBase64ToSave;
        payload.logo_mime_type = logoMimeTypeToSave;
      }

      // 1. Contrato Social
      if (contratoFileToSave !== undefined) {
        payload.contrato_social_base64 = contratoFileToSave ? contratoFileToSave.base64 : null;
        payload.contrato_social_mime_type = contratoFileToSave ? contratoFileToSave.mime : null;
        payload.contrato_social_nome_arquivo = contratoFileToSave ? contratoFileToSave.name : null;
      }

      // 2. Cartão CNPJ
      if (cartaoCnpjFileToSave !== undefined) {
        payload.cartao_cnpj_base64 = cartaoCnpjFileToSave ? cartaoCnpjFileToSave.base64 : null;
        payload.cartao_cnpj_mime_type = cartaoCnpjFileToSave ? cartaoCnpjFileToSave.mime : null;
        payload.cartao_cnpj_nome_arquivo = cartaoCnpjFileToSave ? cartaoCnpjFileToSave.name : null;
      }

      // 3. Documento do Sócio
      if (socioDocFileToSave !== undefined) {
        payload.socio_documento_base64 = socioDocFileToSave ? socioDocFileToSave.base64 : null;
        payload.socio_documento_mime_type = socioDocFileToSave ? socioDocFileToSave.mime : null;
        payload.socio_documento_nome_arquivo = socioDocFileToSave ? socioDocFileToSave.name : null;
      }

      // 4. Comprovante Bancário
      if (comprovanteBancarioFileToSave !== undefined) {
        payload.comprovante_bancario_base64 = comprovanteBancarioFileToSave ? comprovanteBancarioFileToSave.base64 : null;
        payload.comprovante_bancario_mime_type = comprovanteBancarioFileToSave ? comprovanteBancarioFileToSave.mime : null;
        payload.comprovante_bancario_nome_arquivo = comprovanteBancarioFileToSave ? comprovanteBancarioFileToSave.name : null;
      }

      const res = await fetch(`/api/admin/corretoras/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar alterações');
        return;
      }

      toast.success('Configurações e documentos da corretora atualizados com sucesso!');
      load();
    } catch {
      toast.error('Erro de conexão ao salvar');
    } finally {
      setSaving(false);
    }
  }

  // Componente interno para Renderizar Seletor de Arquivo na Edição
  function renderDocumentEditBlock(
    label: string,
    hasFile: boolean | undefined,
    currentFileName: string | null | undefined,
    downloadUrl: string,
    pendingFile: PendingFileDoc | null | undefined,
    onChangeHandler: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onRemoveHandler: () => void
  ) {
    return (
      <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-gray-700 uppercase flex items-center gap-1.5">
            <FileText size={13} className="text-primary" /> {label}
          </label>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
            Máx 10MB
          </span>
        </div>

        {hasFile && (
          <div className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <FileCheck size={14} className="text-emerald-600 shrink-0" />
              <span className="truncate text-gray-700" title={currentFileName || label}>
                {currentFileName || label}
              </span>
            </div>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline shrink-0 ml-2"
            >
              <Download size={11} /> Baixar
            </a>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-md text-xs font-semibold text-gray-700 transition-colors">
            <Upload size={13} className="text-primary" />
            {hasFile ? 'Substituir Documento' : 'Anexar Documento'}
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={onChangeHandler}
              className="hidden"
            />
          </label>

          {pendingFile && (
            <span className="text-[11px] text-emerald-700 font-medium truncate">
              ✓ {pendingFile.name} (novo)
            </span>
          )}

          {pendingFile === null && (
            <span className="text-[11px] text-red-600 font-medium">
              (Será removido ao salvar)
            </span>
          )}

          {hasFile && pendingFile !== null && (
            <button
              type="button"
              onClick={onRemoveHandler}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-red-600 hover:text-red-700 rounded transition-colors cursor-pointer"
            >
              <Trash2 size={11} /> Remover
            </button>
          )}
        </div>

        {pendingFile !== undefined && (
          <p className="text-[10px] text-amber-700 font-medium">
            * Alteração pendente. Clique em &quot;Salvar Alterações&quot; abaixo.
          </p>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="p-12 text-center text-sm text-gray-500">Carregando detalhes da corretora...</div>;
  }

  if (!corretora) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-gray-600">Corretora não encontrada.</p>
        <Link href="/admin/corretoras" className="text-primary underline text-sm">Voltar para listagem</Link>
      </div>
    );
  }

  const isNet4Life = corretora.id === 'corretora_net4life_001';

  return (
    <div className="space-y-6">
      {/* Botão Voltar */}
      <div>
        <Link
          href="/admin/corretoras"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
        >
          <ArrowLeft size={14} /> Voltar para Corretoras
        </Link>
      </div>

      {/* Cartão de Identidade Principal */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {(corretora.logo_base64 && corretora.logo_mime_type) || corretora.whiteLabel?.logoUrl || isNet4Life ? (
              <div className="w-24 h-16 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center p-2 shrink-0">
                <img
                  src={
                    (corretora.logo_base64 && corretora.logo_mime_type)
                      ? `data:${corretora.logo_mime_type};base64,${corretora.logo_base64}`
                      : (isNet4Life ? '/images/corretoras/net4life-logo.png' : corretora.whiteLabel.logoUrl)
                  }
                  alt={corretora.nome_fantasia}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl shrink-0">
                {corretora.nome_fantasia.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">{corretora.nome_fantasia}</h1>
                {isNet4Life && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    <ShieldCheck size={13} /> Corretora Matriz #1
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{corretora.razao_social}</p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600 mt-2">
                <span>CNPJ: <strong className="font-mono">{corretora.cnpj || '-'}</strong></span>
                {corretora.susep && (
                  <span>SUSEP: <strong className="font-mono text-primary">{corretora.susep}</strong></span>
                )}
                {corretora.socio_nome && (
                  <span className="flex items-center gap-1 text-gray-900 font-medium">
                    <UserCheck size={12} className="text-primary" /> Sócio: {corretora.socio_nome} {corretora.socio_cpf && `(${formatarCpf(corretora.socio_cpf)})`}
                  </span>
                )}
                <span className="flex items-center gap-1"><Mail size={12} className="text-gray-400" /> {corretora.email}</span>
                {corretora.telefone_cadastro && (
                  <span className="flex items-center gap-1 text-emerald-800 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                    <Phone size={11} /> Cad: {corretora.telefone_cadastro}
                  </span>
                )}
                {corretora.banco && (
                  <span className="flex items-center gap-1 text-gray-800 font-medium">
                    <Landmark size={12} className="text-primary" /> {corretora.banco} (Ag {corretora.agencia} • Cc {corretora.conta})
                  </span>
                )}
                {corretora.pix_chave && (
                  <span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                    PIX ({corretora.pix_tipo_chave}): {corretora.pix_chave}
                  </span>
                )}
              </div>

              {/* Badges de Documentos com Links de Download Direto */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                <span className="text-[11px] font-semibold text-gray-500 uppercase">Documentos:</span>
                {corretora.has_contrato_social ? (
                  <a
                    href={`/api/admin/corretoras/${corretora.id}/contrato-social`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition-colors"
                    title="Baixar Contrato Social"
                  >
                    <FileCheck size={12} /> Contrato Social
                  </a>
                ) : (
                  <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    Sem Contrato Social
                  </span>
                )}

                {corretora.has_cartao_cnpj ? (
                  <a
                    href={`/api/admin/corretoras/${corretora.id}/cartao-cnpj`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-0.5 rounded transition-colors"
                    title="Baixar Cartão CNPJ"
                  >
                    <FileCheck size={12} /> Cartão CNPJ
                  </a>
                ) : (
                  <span className="text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                    Sem Cartão CNPJ
                  </span>
                )}

                {corretora.has_socio_documento ? (
                  <a
                    href={`/api/admin/corretoras/${corretora.id}/socio-documento`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded transition-colors"
                    title="Baixar Documento do Sócio"
                  >
                    <UserCheck size={12} /> Doc. Sócios
                  </a>
                ) : (
                  <span className="text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                    Sem Doc. Sócios
                  </span>
                )}

                {corretora.has_comprovante_bancario ? (
                  <a
                    href={`/api/admin/corretoras/${corretora.id}/comprovante-bancario`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded transition-colors"
                    title="Baixar Comprovante Bancário e PIX"
                  >
                    <CreditCard size={12} /> Comp. Bancário & PIX
                  </a>
                ) : (
                  <span className="text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
                    Sem Comp. Bancário
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parceiros Credenciados</span>
            <Users size={18} className="text-primary" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total_parceiros ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Corretores e escritórios vinculados</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cotações Geradas</span>
            <Briefcase size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total_cotacoes ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Propostas e rascunhos na rede</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Apólices Emitidas</span>
            <ShieldCheck size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats?.total_vendas ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Contratos vigentes fechados</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Volume em Prêmios</span>
            <Globe size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-2">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(stats?.volume_vendas || 0))}
          </div>
          <div className="text-xs text-gray-500 mt-1">Produção total gerada</div>
        </div>
      </div>

      {/* Seções em 2 colunas: Parceiros Vinculados & Configurações da Corretora */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Parceiros (2 colunas de largura) */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Parceiros Credenciados ({parceiros.length})
            </h2>
            <Link
              href="/admin/parceiros"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Ver todos os parceiros <ExternalLink size={12} />
            </Link>
          </div>

          <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
            <table className="w-full text-left text-sm text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase sticky top-0">
                <tr>
                  <th className="py-3 px-4">Nome / Razão Social</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parceiros.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-gray-500">
                      Nenhum parceiro credenciado diretamente nesta corretora.
                    </td>
                  </tr>
                ) : (
                  parceiros.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{p.nome_fantasia || p.razao_social}</div>
                        {p.nome_fantasia && p.nome_fantasia !== p.razao_social && (
                          <div className="text-xs text-gray-500">{p.razao_social}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-gray-500">
                        {p.person_type === 'pf' ? 'Corretor PF' : 'Corretora PJ'}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">{p.email}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                          Ativo
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/admin/parceiros/${p.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Ver Parceiro
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Coluna 2: Ajustes Cadastrais & Configurações (1 coluna) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">Configurações & Cadastros</h3>
            <p className="text-xs text-gray-500">Ajuste os dados cadastrais, societários e documentos</p>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Bloco Empresa & Contato */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-[#0e4a5a] uppercase flex items-center gap-1">
                <Building size={13} className="text-primary" /> Dados Institucionais
              </label>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  required
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Razão Social</label>
                <input
                  type="text"
                  required
                  value={form.razao_social}
                  onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Registro SUSEP</label>
                  <input
                    type="text"
                    value={form.susep}
                    onChange={(e) => setForm({ ...form, susep: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Telefone da Corretora</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">E-mail Institucional</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Telefone para Cadastro</label>
                  <input
                    type="text"
                    value={form.telefone_cadastro}
                    onChange={(e) => setForm({ ...form, telefone_cadastro: maskPhone(e.target.value) })}
                    placeholder="(00) 90000-0000"
                    className="w-full bg-gray-50 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Bloco Quadro Societário */}
            <div className="border-t border-gray-100 pt-3 space-y-2.5">
              <label className="block text-xs font-bold text-[#0e4a5a] uppercase flex items-center gap-1">
                <UserCheck size={13} className="text-primary" /> Sócio Administrador
              </label>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Nome do Sócio</label>
                <input
                  type="text"
                  value={form.socio_nome}
                  onChange={(e) => setForm({ ...form, socio_nome: e.target.value })}
                  placeholder="Nome completo do sócio"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">CPF do Sócio</label>
                  <input
                    type="text"
                    value={form.socio_cpf}
                    onChange={(e) => setForm({ ...form, socio_cpf: maskCpfCnpj(e.target.value) })}
                    placeholder="000.000.000-00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">RG do Sócio</label>
                  <input
                    type="text"
                    value={form.socio_rg}
                    onChange={(e) => setForm({ ...form, socio_rg: e.target.value })}
                    placeholder="RG com órgão emissor"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">E-mail Nominal do Sócio</label>
                  <input
                    type="email"
                    value={form.socio_email}
                    onChange={(e) => setForm({ ...form, socio_email: e.target.value })}
                    placeholder="socio@corretora.com.br"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 uppercase mb-1">Telefone do Sócio</label>
                  <input
                    type="text"
                    value={form.socio_telefone}
                    onChange={(e) => setForm({ ...form, socio_telefone: maskPhone(e.target.value) })}
                    placeholder="(00) 90000-0000"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Bloco Dados Bancários & PIX */}
            <div className="border-t border-gray-100 pt-3 space-y-2.5">
              <label className="block text-xs font-bold text-[#0e4a5a] uppercase flex items-center gap-1.5">
                <Landmark size={13} className="text-primary" /> Dados Bancários & PIX
              </label>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Banco</label>
                <select
                  value={form.banco}
                  onChange={(e) => setForm({ ...form, banco: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">Selecione o banco...</option>
                  {BANCOS_BRASILEIROS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {form.banco === 'Outro (informar código/nome)' && (
                  <input
                    type="text"
                    value={bancoCustom}
                    onChange={(e) => setBancoCustom(e.target.value)}
                    placeholder="Ex: 655 - Banco Votorantim"
                    className="w-full mt-1.5 bg-white border border-gray-300 rounded-lg px-2.5 py-1 text-xs text-gray-900 focus:outline-none focus:border-primary"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Agência com Dígito</label>
                  <input
                    type="text"
                    value={form.agencia}
                    onChange={(e) => setForm({ ...form, agencia: e.target.value })}
                    placeholder="0001"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Conta Corrente</label>
                  <input
                    type="text"
                    value={form.conta}
                    onChange={(e) => setForm({ ...form, conta: e.target.value })}
                    placeholder="12345-6"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Tipo de Chave PIX</label>
                  <select
                    value={form.pix_tipo_chave}
                    onChange={(e) => setForm({ ...form, pix_tipo_chave: e.target.value, pix_chave: '' })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone / Celular</option>
                    <option value="cpf">CPF</option>
                    <option value="aleatoria">Aleatória (EVP)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 uppercase mb-1">Chave PIX</label>
                  <input
                    type="text"
                    value={form.pix_chave}
                    onChange={(e) => {
                      const val = e.target.value;
                      let formatted = val;
                      if (form.pix_tipo_chave === 'cnpj') formatted = maskCnpj(val);
                      else if (form.pix_tipo_chave === 'cpf') formatted = maskCpfCnpj(val);
                      else if (form.pix_tipo_chave === 'telefone') formatted = maskPhone(val);
                      setForm({ ...form, pix_chave: formatted });
                    }}
                    placeholder="Chave PIX"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Bloco Documentos Anexados (4 Documentos) */}
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <label className="block text-xs font-bold text-[#0e4a5a] uppercase flex items-center gap-1.5">
                <FileCheck size={13} className="text-primary" /> Documentos Anexados
              </label>

              {/* 1. Contrato Social */}
              {renderDocumentEditBlock(
                'Contrato Social',
                corretora.has_contrato_social,
                corretora.contrato_social_nome_arquivo,
                `/api/admin/corretoras/${id}/contrato-social`,
                contratoFileToSave,
                (e) => {
                  const f = e.target.files?.[0];
                  if (f) handleGenericDocChange(f, 'Contrato Social', setContratoFileToSave);
                },
                () => setContratoFileToSave(null)
              )}

              {/* 2. Cartão CNPJ */}
              {renderDocumentEditBlock(
                'Cartão CNPJ',
                corretora.has_cartao_cnpj,
                corretora.cartao_cnpj_nome_arquivo,
                `/api/admin/corretoras/${id}/cartao-cnpj`,
                cartaoCnpjFileToSave,
                (e) => {
                  const f = e.target.files?.[0];
                  if (f) handleGenericDocChange(f, 'Cartão CNPJ', setCartaoCnpjFileToSave);
                },
                () => setCartaoCnpjFileToSave(null)
              )}

              {/* 3. Documento do Sócio */}
              {renderDocumentEditBlock(
                'Documento do Sócio (RG/CPF)',
                corretora.has_socio_documento,
                corretora.socio_documento_nome_arquivo,
                `/api/admin/corretoras/${id}/socio-documento`,
                socioDocFileToSave,
                (e) => {
                  const f = e.target.files?.[0];
                  if (f) handleGenericDocChange(f, 'Documento do Sócio', setSocioDocFileToSave);
                },
                () => setSocioDocFileToSave(null)
              )}

              {/* 4. Comprovante Bancário e PIX */}
              {renderDocumentEditBlock(
                'Comprovante Bancário & PIX',
                corretora.has_comprovante_bancario,
                corretora.comprovante_bancario_nome_arquivo,
                `/api/admin/corretoras/${id}/comprovante-bancario`,
                comprovanteBancarioFileToSave,
                (e) => {
                  const f = e.target.files?.[0];
                  if (f) handleGenericDocChange(f, 'Comprovante Bancário', setComprovanteBancarioFileToSave);
                },
                () => setComprovanteBancarioFileToSave(null)
              )}
            </div>

            {/* Bloco Logotipo & Identidade Visual */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700 uppercase">
                  Logotipo da Corretora
                </label>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                  Máx 2MB
                </span>
              </div>

              <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                <div className="w-24 h-14 rounded-md bg-white border border-gray-200 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-xs">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logotipo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-center px-1">
                      <ImageIcon size={16} className="mx-auto text-gray-300" />
                      <span className="text-[9px] text-gray-400 font-medium">Sem Logo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-md text-xs font-semibold text-gray-700 transition-colors">
                      <Upload size={13} className="text-primary" /> {logoPreview ? 'Trocar Logo' : 'Enviar Logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                    </label>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
                  </div>
                  {logoBase64ToSave !== undefined && (
                    <p className="text-[10px] text-amber-700 font-medium">
                      * Alteração pendente. Clique em &quot;Salvar Alterações&quot;.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Cores White Label */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cor Primária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-xs text-gray-700">{form.primaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cor Secundária</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.secondaryColor}
                    onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
                  />
                  <span className="font-mono text-xs text-gray-700">{form.secondaryColor}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#072a33] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save size={16} />
                {saving ? 'Gravando Alterações...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
