'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Building, CheckCircle, Clock, XCircle, Plus, Users, Briefcase, ExternalLink,
  ShieldCheck, Phone, Mail, MapPin, Copy, Check, Eye, EyeOff, Upload, Trash2,
  Image as ImageIcon, Landmark, FileText, FileCheck, Download, UserCheck, CreditCard,
  AlertCircle
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { maskCnpj, maskPhone, maskCpfCnpj } from '@/components/modals/masks';
import type { WhiteLabelConfig } from '@/lib/white-label';
import { TableScrollContainer } from '@/components/ui/TableScrollContainer';
import { toast } from '@/components/ui/toast';

export const BANCOS_BRASILEIROS = [
  '001 - Banco do Brasil S.A.',
  '033 - Banco Santander (Brasil) S.A.',
  '104 - Caixa Econômica Federal',
  '237 - Banco Bradesco S.A.',
  '341 - Itaú Unibanco S.A.',
  '077 - Banco Inter S.A.',
  '260 - Nu Pagamentos S.A. (Nubank)',
  '336 - Banco C6 S.A.',
  '212 - Banco Original S.A.',
  '756 - Banco Cooperativo Sicoob S.A.',
  '748 - Banco Cooperativo Sicredi S.A.',
  '422 - Banco Safra S.A.',
  '655 - Banco Votorantim S.A.',
  '041 - Banrisul',
  '070 - BRB - Banco de Brasília',
  '197 - Stone Pagamentos',
  '290 - PagBank (PagSeguro)',
  '380 - PicPay',
  'Outro (informar código/nome)',
];

interface Corretora {
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
  address: Record<string, unknown>;
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
  partners_count: number;
  cotacoes_count: number;
  sales_count: number;
  whiteLabel: WhiteLabelConfig;
}

interface UploadedFileInfo {
  name: string;
  size: string;
  mime: string;
}

const FORM_VAZIO = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  susep: '',
  email: '',
  phone: '',
  telefone_cadastro: '',
  street: '',
  neighborhood: '',
  city: '',
  state: '',
  socio_nome: '',
  socio_cpf: '',
  socio_rg: '',
  socio_email: '',
  socio_telefone: '',
  slug: '',
  primaryColor: '#004172',
  secondaryColor: '#00a0af',
  logoUrl: '',
  logo_base64: '',
  logo_mime_type: '',
  banco: '',
  agencia: '',
  conta: '',
  pix_tipo_chave: 'cnpj',
  pix_chave: '',
  contrato_social_base64: '',
  contrato_social_mime_type: '',
  contrato_social_nome_arquivo: '',
  cartao_cnpj_base64: '',
  cartao_cnpj_mime_type: '',
  cartao_cnpj_nome_arquivo: '',
  socio_documento_base64: '',
  socio_documento_mime_type: '',
  socio_documento_nome_arquivo: '',
  comprovante_bancario_base64: '',
  comprovante_bancario_mime_type: '',
  comprovante_bancario_nome_arquivo: '',
  admin_name: '',
  admin_email: '',
  admin_password: '',
  send_invite_email: true,
};

function formatarCnpj(cnpj: string | null): string {
  if (!cnpj) return '-';
  const n = cnpj.replace(/\D/g, '');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return cnpj;
}

function formatarCpf(cpf: string | null): string {
  if (!cpf) return '-';
  const n = cpf.replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return cpf;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:    { label: 'Ativa',     color: '#417572', icon: CheckCircle },
  pending:   { label: 'Pendente',  color: '#b45309', icon: Clock },
  suspended: { label: 'Suspensa',  color: '#b91c1c', icon: XCircle },
};

export default function AdminCorretorasPage() {
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [bancoCustom, setBancoCustom] = useState('');

  // Estados dos 4 arquivos
  const [contratoFile, setContratoFile] = useState<UploadedFileInfo | null>(null);
  const [cartaoCnpjFile, setCartaoCnpjFile] = useState<UploadedFileInfo | null>(null);
  const [socioDocFile, setSocioDocFile] = useState<UploadedFileInfo | null>(null);
  const [comprovanteBancarioFile, setComprovanteBancarioFile] = useState<UploadedFileInfo | null>(null);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/corretoras');
      const data = await res.json();
      setCorretoras(data.corretoras ?? []);
      setCanManage(Boolean(data.canManage));
    } catch {
      setCorretoras([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      toast.error('O logotipo excede o limite máximo permitido de 2MB.');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem válido (PNG, JPEG ou WEBP).');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoPreview(result);
      setForm((prev) => ({
        ...prev,
        logo_base64: result,
        logo_mime_type: file.type,
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setLogoPreview(null);
    setForm((prev) => ({
      ...prev,
      logo_base64: '',
      logo_mime_type: '',
    }));
  }

  // Helper genérico para upload de documento com validação de tipo e tamanho
  function handleGenericFileUpload(
    file: File,
    label: string,
    onSuccess: (info: UploadedFileInfo, base64: string, mime: string, name: string) => void
  ) {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error(`O arquivo de ${label} excede o limite máximo permitido de 10MB.`);
      return;
    }

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf');
    if (!allowedTypes.includes(file.type) && !isPdfByName) {
      toast.error(`Selecione um arquivo de ${label} em PDF ou Imagem (PNG, JPEG, WEBP).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const formattedSize = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(file.size / 1024)} KB`;

      const mimeType = file.type || 'application/pdf';
      onSuccess(
        { name: file.name, size: formattedSize, mime: mimeType },
        result,
        mimeType,
        file.name
      );
      toast.success(`${label} carregado com sucesso!`);
    };
    reader.readAsDataURL(file);
  }

  // 1. Contrato Social
  function handleContratoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleGenericFileUpload(file, 'Contrato Social', (info, base64, mime, name) => {
      setContratoFile(info);
      setForm((prev) => ({
        ...prev,
        contrato_social_base64: base64,
        contrato_social_mime_type: mime,
        contrato_social_nome_arquivo: name,
      }));
    });
  }

  function handleRemoveContrato() {
    setContratoFile(null);
    setForm((prev) => ({
      ...prev,
      contrato_social_base64: '',
      contrato_social_mime_type: '',
      contrato_social_nome_arquivo: '',
    }));
  }

  // 2. Cartão CNPJ
  function handleCartaoCnpjChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleGenericFileUpload(file, 'Cartão CNPJ', (info, base64, mime, name) => {
      setCartaoCnpjFile(info);
      setForm((prev) => ({
        ...prev,
        cartao_cnpj_base64: base64,
        cartao_cnpj_mime_type: mime,
        cartao_cnpj_nome_arquivo: name,
      }));
    });
  }

  function handleRemoveCartaoCnpj() {
    setCartaoCnpjFile(null);
    setForm((prev) => ({
      ...prev,
      cartao_cnpj_base64: '',
      cartao_cnpj_mime_type: '',
      cartao_cnpj_nome_arquivo: '',
    }));
  }

  // 3. Documento dos Sócios (RG/CPF)
  function handleSocioDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleGenericFileUpload(file, 'Documento de Identidade do Sócio (RG/CPF)', (info, base64, mime, name) => {
      setSocioDocFile(info);
      setForm((prev) => ({
        ...prev,
        socio_documento_base64: base64,
        socio_documento_mime_type: mime,
        socio_documento_nome_arquivo: name,
      }));
    });
  }

  function handleRemoveSocioDoc() {
    setSocioDocFile(null);
    setForm((prev) => ({
      ...prev,
      socio_documento_base64: '',
      socio_documento_mime_type: '',
      socio_documento_nome_arquivo: '',
    }));
  }

  // 4. Comprovante Bancário e PIX
  function handleComprovanteBancarioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleGenericFileUpload(file, 'Comprovante Bancário da Corretora e Pix', (info, base64, mime, name) => {
      setComprovanteBancarioFile(info);
      setForm((prev) => ({
        ...prev,
        comprovante_bancario_base64: base64,
        comprovante_bancario_mime_type: mime,
        comprovante_bancario_nome_arquivo: name,
      }));
    });
  }

  function handleRemoveComprovanteBancario() {
    setComprovanteBancarioFile(null);
    setForm((prev) => ({
      ...prev,
      comprovante_bancario_base64: '',
      comprovante_bancario_mime_type: '',
      comprovante_bancario_nome_arquivo: '',
    }));
  }

  // Atalhos para preenchimento rápido do PIX
  function handlePreencherPix(tipo: 'cnpj' | 'cpf' | 'socio_email' | 'email' | 'telefone_cadastro' | 'phone') {
    if (tipo === 'cnpj' && form.cnpj) {
      setForm((prev) => ({ ...prev, pix_tipo_chave: 'cnpj', pix_chave: form.cnpj }));
    } else if (tipo === 'cpf' && form.socio_cpf) {
      setForm((prev) => ({ ...prev, pix_tipo_chave: 'cpf', pix_chave: form.socio_cpf }));
    } else if (tipo === 'socio_email' && form.socio_email) {
      setForm((prev) => ({ ...prev, pix_tipo_chave: 'email', pix_chave: form.socio_email }));
    } else if (tipo === 'email' && form.email) {
      setForm((prev) => ({ ...prev, pix_tipo_chave: 'email', pix_chave: form.email }));
    } else if (tipo === 'telefone_cadastro' && form.telefone_cadastro) {
      setForm((prev) => ({ ...prev, pix_tipo_chave: 'telefone', pix_chave: form.telefone_cadastro }));
    } else if (tipo === 'phone' && form.phone) {
      setForm((prev) => ({ ...prev, pix_tipo_chave: 'telefone', pix_chave: form.phone }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCopied(false);

    const bancoFinal = form.banco === 'Outro (informar código/nome)' ? bancoCustom.trim() : form.banco.trim();

    // Validações explícitas dos 4 documentos obrigatórios
    if (!form.contrato_social_base64) {
      toast.error('O upload do Contrato Social é obrigatório.');
      setSaving(false);
      return;
    }

    if (!form.cartao_cnpj_base64) {
      toast.error('O upload do Cartão CNPJ é obrigatório.');
      setSaving(false);
      return;
    }

    if (!form.socio_documento_base64) {
      toast.error('O upload do Documento de Identidade do Sócio (RG/CPF) é obrigatório.');
      setSaving(false);
      return;
    }

    if (!form.comprovante_bancario_base64) {
      toast.error('O upload do Comprovante Bancário e PIX é obrigatório.');
      setSaving(false);
      return;
    }

    if (!form.telefone_cadastro.trim()) {
      toast.error('Informe o Telefone para cadastro.');
      setSaving(false);
      return;
    }

    if (!form.socio_nome.trim()) {
      toast.error('Informe o Nome do sócio administrador.');
      setSaving(false);
      return;
    }

    if (!form.socio_cpf.trim()) {
      toast.error('Informe o CPF do sócio.');
      setSaving(false);
      return;
    }

    if (!form.socio_rg.trim()) {
      toast.error('Informe o RG do sócio.');
      setSaving(false);
      return;
    }

    if (!form.socio_email.trim()) {
      toast.error('Informe o E-mail nominal do sócio.');
      setSaving(false);
      return;
    }

    if (!bancoFinal) {
      toast.error('Selecione ou informe o Banco.');
      setSaving(false);
      return;
    }

    if (!form.agencia.trim()) {
      toast.error('Informe a Agência bancária.');
      setSaving(false);
      return;
    }

    if (!form.conta.trim()) {
      toast.error('Informe a Conta bancária.');
      setSaving(false);
      return;
    }

    if (!form.pix_chave.trim()) {
      toast.error('Informe a Chave PIX.');
      setSaving(false);
      return;
    }

    const payload = {
      ...form,
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia.trim(),
      cnpj: form.cnpj.trim(),
      susep: form.susep.trim() || undefined,
      email: form.email.trim(),
      phone: form.phone.trim(),
      telefone_cadastro: form.telefone_cadastro.trim(),
      socio_nome: form.socio_nome.trim(),
      socio_cpf: form.socio_cpf.trim(),
      socio_rg: form.socio_rg.trim(),
      socio_email: form.socio_email.trim(),
      socio_telefone: form.socio_telefone.trim() || undefined,
      street: form.street.trim() || undefined,
      neighborhood: form.neighborhood.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      slug: form.slug.trim() || undefined,
      primaryColor: form.primaryColor.trim() || undefined,
      secondaryColor: form.secondaryColor.trim() || undefined,
      logoUrl: form.logoUrl.trim() || undefined,
      logo_base64: form.logo_base64.trim() || undefined,
      logo_mime_type: form.logo_mime_type.trim() || undefined,
      banco: bancoFinal,
      agencia: form.agencia.trim(),
      conta: form.conta.trim(),
      pix_tipo_chave: form.pix_tipo_chave,
      pix_chave: form.pix_chave.trim(),
      contrato_social_base64: form.contrato_social_base64,
      contrato_social_mime_type: form.contrato_social_mime_type,
      contrato_social_nome_arquivo: form.contrato_social_nome_arquivo,
      cartao_cnpj_base64: form.cartao_cnpj_base64,
      cartao_cnpj_mime_type: form.cartao_cnpj_mime_type,
      cartao_cnpj_nome_arquivo: form.cartao_cnpj_nome_arquivo,
      socio_documento_base64: form.socio_documento_base64,
      socio_documento_mime_type: form.socio_documento_mime_type,
      socio_documento_nome_arquivo: form.socio_documento_nome_arquivo,
      comprovante_bancario_base64: form.comprovante_bancario_base64,
      comprovante_bancario_mime_type: form.comprovante_bancario_mime_type,
      comprovante_bancario_nome_arquivo: form.comprovante_bancario_nome_arquivo,
      admin_name: form.admin_name.trim() || form.socio_nome.trim() || form.nome_fantasia.trim(),
      admin_email: form.admin_email.trim() || form.socio_email.trim() || form.email.trim(),
      admin_password: form.admin_password.trim() || undefined,
      send_invite_email: form.send_invite_email,
    };

    try {
      const res = await fetch('/api/admin/corretoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Erro ao cadastrar corretora');
        return;
      }

      const emailLogin = data.adminUser?.email || payload.admin_email;
      const senhaProvisoria = data.temporaryPassword;

      if (senhaProvisoria && emailLogin) {
        toast.success(`Corretora "${data.corretora.nome_fantasia}" cadastrada com sucesso!`, {
          description: (
            <div className="mt-1 flex flex-col gap-1 text-xs">
              <div>Login Gestor: <strong>{emailLogin}</strong></div>
              <div>Senha provisória: <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold text-emerald-900">{senhaProvisoria}</code></div>
            </div>
          ),
          action: {
            label: 'Copiar Credenciais',
            onClick: () => handleCopyCredentials(emailLogin, senhaProvisoria),
          },
        });
      } else {
        toast.success(`Corretora "${data.corretora.nome_fantasia}" cadastrada com sucesso!`);
      }

      setForm(FORM_VAZIO);
      setBancoCustom('');
      setContratoFile(null);
      setCartaoCnpjFile(null);
      setSocioDocFile(null);
      setComprovanteBancarioFile(null);
      setLogoPreview(null);
      setShowPassword(false);
      setShowForm(false);
      load();
    } catch {
      toast.error('Erro de conexão ao cadastrar corretora');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyCredentials(email: string, pass: string) {
    navigator.clipboard.writeText(`Acesso Corretora DuoLife Hub\nLogin: ${email}\nSenha: ${pass}`);
    setCopied(true);
    toast.success('Credenciais de acesso copiadas para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  }

  // Componente interno para Renderizar Caixa de Upload de Documento
  function renderUploadBox(
    label: string,
    descricao: string,
    fileState: UploadedFileInfo | null,
    onChangeHandler: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onRemoveHandler: () => void,
    inputAccept = '.pdf,image/png,image/jpeg,image/webp'
  ) {
    return (
      <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-800 uppercase flex items-center gap-1.5">
            <FileText size={14} className="text-primary" /> {label}
          </span>
          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            Obrigatório *
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mb-2.5">{descricao}</p>

        {fileState ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-emerald-200 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <FileCheck size={18} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-xs text-gray-900 truncate flex items-center gap-1.5" title={fileState.name}>
                  <span className="truncate">{fileState.name}</span>
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded uppercase shrink-0">
                    Anexado
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Tamanho: <strong className="text-gray-700">{fileState.size}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-md text-xs font-semibold text-gray-700 transition-colors">
                <Upload size={12} className="text-primary" /> Trocar
                <input
                  type="file"
                  accept={inputAccept}
                  onChange={onChangeHandler}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={onRemoveHandler}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-md transition-colors cursor-pointer"
              >
                <Trash2 size={12} /> Remover
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg bg-white text-center hover:border-primary/50 transition-colors">
            <div className="text-xs font-semibold text-gray-800">
              Clique para selecionar o arquivo
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 mb-2.5">
              Formatos aceitos: PDF, PNG, JPEG ou WEBP (máx 10MB)
            </p>
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0e4a5a] hover:bg-[#072a33] text-white rounded-lg text-xs font-bold shadow-xs transition-all">
              <Upload size={13} /> Selecionar Arquivo
              <input
                type="file"
                required
                accept={inputAccept}
                onChange={onChangeHandler}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topo / Hero */}
      <div className="admin-hero-card flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="admin-eyebrow">REDE & CORRETORAS MASTER</span>
          <h1 className="page-title text-2xl font-bold text-gray-900 mt-1">Corretoras da Plataforma</h1>
          <p className="admin-hero-copy text-sm text-gray-600 mt-1">
            Gestão de empresas corretoras que utilizam o DuoLife Hub para distribuir seguros e gerenciar seus parceiros.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#072a33] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            {showForm ? 'Fechar Cadastro' : 'Nova Corretora'}
          </button>
        )}
      </div>

      {/* Formulário de Cadastro Expansível */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Building size={18} className="text-primary" />
                Cadastrar Nova Corretora Master
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Preencha os dados institucionais, societários, bancários e anexe os documentos obrigatórios.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
              * Campos Obrigatórios
            </span>
          </div>

          {/* BLOCO 1: DADOS INSTITUCIONAIS DA EMPRESA */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 border-b border-gray-100 pb-1.5">
              <Building size={15} className="text-primary" /> 1. Dados da Corretora & Contatos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Razão Social *</label>
                <input
                  type="text"
                  required
                  value={form.razao_social}
                  onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                  placeholder="Ex: Alfa Corretora de Seguros Ltda"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome Fantasia *</label>
                <input
                  type="text"
                  required
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  placeholder="Ex: Alfa Seguros"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">CNPJ *</label>
                <input
                  type="text"
                  required
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Registro SUSEP</label>
                <input
                  type="text"
                  value={form.susep}
                  onChange={(e) => setForm({ ...form, susep: e.target.value })}
                  placeholder="Ex: 202018702"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">E-mail Institucional *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="contato@corretora.com.br"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Telefone da Corretora *</label>
                <input
                  type="text"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1 flex items-center justify-between">
                  <span>Telefone para Cadastro *</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.telefone_cadastro}
                  onChange={(e) => setForm({ ...form, telefone_cadastro: maskPhone(e.target.value) })}
                  placeholder="(00) 90000-0000"
                  maxLength={15}
                  className="w-full bg-gray-50 border border-emerald-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Logradouro / Endereço</label>
                <input
                  type="text"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                  placeholder="Rua, Número, Sala"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Cidade</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Florianópolis"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  placeholder="SC"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* BLOCO 2: QUADRO SOCIETÁRIO & SÓCIOS */}
          <div className="border-t border-gray-200/80 pt-4 space-y-3">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                <UserCheck size={16} className="text-primary" /> 2. Quadro Societário & Sócio Administrador
              </h3>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Identificação & Documento Obrigatórios
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Dados nominais e documento de identificação pessoal do sócio administrador da corretora.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome Completo do Sócio *</label>
                <input
                  type="text"
                  required
                  value={form.socio_nome}
                  onChange={(e) => setForm({ ...form, socio_nome: e.target.value })}
                  placeholder="Ex: Carlos Eduardo de Souza"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">CPF do Sócio *</label>
                <input
                  type="text"
                  required
                  value={form.socio_cpf}
                  onChange={(e) => setForm({ ...form, socio_cpf: maskCpfCnpj(e.target.value) })}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">RG do Sócio *</label>
                <input
                  type="text"
                  required
                  value={form.socio_rg}
                  onChange={(e) => setForm({ ...form, socio_rg: e.target.value })}
                  placeholder="Ex: 1.234.567 SSP/SC"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">E-mail Nominal do Sócio *</label>
                <input
                  type="email"
                  required
                  value={form.socio_email}
                  onChange={(e) => setForm({ ...form, socio_email: e.target.value })}
                  placeholder="socio@corretora.com.br"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">E-mail nominal direto para avisos societários e acesso</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Telefone / WhatsApp do Sócio</label>
                <input
                  type="text"
                  value={form.socio_telefone}
                  onChange={(e) => setForm({ ...form, socio_telefone: maskPhone(e.target.value) })}
                  placeholder="(00) 90000-0000"
                  maxLength={15}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Upload do Documento de Identidade do Sócio (RG/CPF) */}
            <div className="mt-2">
              {renderUploadBox(
                'Documento de Identidade dos Sócios (RG / CPF / CNH)',
                'Anexe o documento de identificação com foto do sócio administrador (frente e verso ou CNH digital em PDF/imagem).',
                socioDocFile,
                handleSocioDocChange,
                handleRemoveSocioDoc
              )}
            </div>
          </div>

          {/* BLOCO 3: INFORMAÇÕES BANCÁRIAS, PIX & COMPROVANTE */}
          <div className="border-t border-gray-200/80 pt-4 space-y-3">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                <Landmark size={16} className="text-primary" /> 3. Informações Bancárias, Chave PIX & Comprovante
              </h3>
              <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Obrigatório *
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Dados da conta e chave PIX para repasse de comissões da corretora, acompanhados de comprovante bancário oficial.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Banco *</label>
                <select
                  required
                  value={form.banco}
                  onChange={(e) => setForm({ ...form, banco: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">Selecione o banco...</option>
                  {BANCOS_BRASILEIROS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {form.banco === 'Outro (informar código/nome)' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      required
                      value={bancoCustom}
                      onChange={(e) => setBancoCustom(e.target.value)}
                      placeholder="Ex: 655 - Banco Votorantim"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Agência com Dígito *</label>
                <input
                  type="text"
                  required
                  value={form.agencia}
                  onChange={(e) => setForm({ ...form, agencia: e.target.value })}
                  placeholder="Ex: 0001 ou 1234-5"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Conta Corrente com Dígito *</label>
                <input
                  type="text"
                  required
                  value={form.conta}
                  onChange={(e) => setForm({ ...form, conta: e.target.value })}
                  placeholder="Ex: 12345-6"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                />
              </div>
            </div>

            {/* Sub-bloco PIX */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Tipo de Chave PIX *</label>
                <select
                  required
                  value={form.pix_tipo_chave}
                  onChange={(e) => {
                    const novoTipo = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      pix_tipo_chave: novoTipo,
                      pix_chave: '',
                    }));
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone / Celular</option>
                  <option value="cpf">CPF (sócio)</option>
                  <option value="aleatoria">Chave Aleatória (EVP)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700 uppercase">Chave PIX *</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {form.pix_tipo_chave === 'cnpj' && form.cnpj && (
                      <button
                        type="button"
                        onClick={() => handlePreencherPix('cnpj')}
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                      >
                        Usar CNPJ da corretora
                      </button>
                    )}
                    {form.pix_tipo_chave === 'cpf' && form.socio_cpf && (
                      <button
                        type="button"
                        onClick={() => handlePreencherPix('cpf')}
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                      >
                        Usar CPF do sócio
                      </button>
                    )}
                    {form.pix_tipo_chave === 'email' && (
                      <>
                        {form.socio_email && (
                          <button
                            type="button"
                            onClick={() => handlePreencherPix('socio_email')}
                            className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                          >
                            Usar e-mail nominal
                          </button>
                        )}
                        {form.email && (
                          <button
                            type="button"
                            onClick={() => handlePreencherPix('email')}
                            className="text-[11px] font-medium text-gray-500 hover:underline cursor-pointer"
                          >
                            Usar e-mail institucional
                          </button>
                        )}
                      </>
                    )}
                    {form.pix_tipo_chave === 'telefone' && (
                      <>
                        {form.telefone_cadastro && (
                          <button
                            type="button"
                            onClick={() => handlePreencherPix('telefone_cadastro')}
                            className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
                          >
                            Usar tel. cadastro
                          </button>
                        )}
                        {form.phone && (
                          <button
                            type="button"
                            onClick={() => handlePreencherPix('phone')}
                            className="text-[11px] font-medium text-gray-500 hover:underline cursor-pointer"
                          >
                            Usar tel. corretora
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={form.pix_chave}
                  onChange={(e) => {
                    const val = e.target.value;
                    let formatted = val;
                    if (form.pix_tipo_chave === 'cnpj') formatted = maskCnpj(val);
                    else if (form.pix_tipo_chave === 'cpf') formatted = maskCpfCnpj(val);
                    else if (form.pix_tipo_chave === 'telefone') formatted = maskPhone(val);
                    setForm({ ...form, pix_chave: formatted });
                  }}
                  placeholder={
                    form.pix_tipo_chave === 'cnpj' ? '00.000.000/0000-00' :
                    form.pix_tipo_chave === 'cpf' ? '000.000.000-00' :
                    form.pix_tipo_chave === 'telefone' ? '(00) 00000-0000' :
                    form.pix_tipo_chave === 'email' ? 'financeiro@corretora.com.br' :
                    'Chave EVP (ex: 123e4567-e89b-12d3-a456-426614174000)'
                  }
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                />
              </div>
            </div>

            {/* Upload do Comprovante Bancário e PIX */}
            <div className="mt-2">
              {renderUploadBox(
                'Comprovante Bancário da Corretora e PIX',
                'Anexe o extrato bancário oficial, declaração de titularidade da conta ou comprovante com os dados da conta e chave PIX da corretora.',
                comprovanteBancarioFile,
                handleComprovanteBancarioChange,
                handleRemoveComprovanteBancario
              )}
            </div>
          </div>

          {/* BLOCO 4: DOCUMENTOS SOCIETÁRIOS (PJ) */}
          <div className="border-t border-gray-200/80 pt-4 space-y-3">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                <FileText size={16} className="text-primary" /> 4. Documentos da Empresa (Pessoa Jurídica)
              </h3>
              <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Obrigatório *
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Documentos oficiais de constituição e registro da pessoa jurídica na Receita Federal e Junta Comercial.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderUploadBox(
                'Contrato Social Consolidado',
                'Anexe o Contrato Social consolidado ou a última alteração contratual registrada na Junta Comercial.',
                contratoFile,
                handleContratoChange,
                handleRemoveContrato
              )}

              {renderUploadBox(
                'Cartão CNPJ Atualizado',
                'Anexe o Comprovante de Inscrição e de Situação Cadastral (Cartão CNPJ emitido no site da Receita Federal).',
                cartaoCnpjFile,
                handleCartaoCnpjChange,
                handleRemoveCartaoCnpj
              )}
            </div>
          </div>

          {/* BLOCO 5: LOGOTIPO E IDENTIDADE VISUAL */}
          <div className="border-t border-gray-200/80 pt-4 space-y-2">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5">
                <ImageIcon size={16} className="text-primary" /> 5. Logotipo da Corretora (PDF e Proposta)
              </h3>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Máximo 2MB • PNG ou JPEG
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              O logotipo cadastrado será renderizado automaticamente no topo do Contrato/Proposta em PDF.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
              <div className="w-36 h-20 rounded-lg bg-white border border-gray-200 flex items-center justify-center p-1.5 overflow-hidden shrink-0 shadow-xs">
                {logoPreview ? (
                  <img src={logoPreview} alt="Prévia do Logotipo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-center px-2">
                    <ImageIcon size={20} className="mx-auto text-gray-300 mb-0.5" />
                    <span className="text-[10px] text-gray-400 font-medium">Sem Logotipo</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg text-xs font-semibold text-gray-700 shadow-xs transition-colors">
                    <Upload size={14} className="text-primary" /> Enviar Logotipo (máx 2MB)
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
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} /> Remover Imagem
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  O arquivo é salvo de forma definitiva e segura diretamente no banco de dados da plataforma.
                </p>
              </div>
            </div>
          </div>

          {/* BLOCO 6: ACESSO DO ADMINISTRADOR MASTER */}
          <div className="border-t border-gray-200/80 pt-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0e4a5a] flex items-center gap-1.5 mb-1">
              <ShieldCheck size={16} className="text-emerald-600" /> 6. Acesso do Administrador Master da Corretora
            </h3>
            <p className="text-xs text-gray-500 mb-2">
              Credenciais para o gestor da corretora fazer login no portal e gerenciar seus próprios corretores e propostas.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nome do Administrador</label>
                <input
                  type="text"
                  value={form.admin_name}
                  onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                  placeholder={form.socio_nome || form.nome_fantasia || 'Nome do Gestor'}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">E-mail de Login do Gestor</label>
                <input
                  type="email"
                  value={form.admin_email}
                  onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  placeholder={form.socio_email || form.email || 'gestor@corretora.com.br'}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Senha Inicial / Provisória</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.admin_password}
                    onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                    placeholder="Vazio = gera senha aleatória"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-900 focus:outline-none focus:border-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 focus:outline-none cursor-pointer transition-colors"
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="send_invite_email"
                checked={form.send_invite_email}
                onChange={(e) => setForm({ ...form, send_invite_email: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
              />
              <label htmlFor="send_invite_email" className="text-xs font-medium text-gray-700 cursor-pointer">
                Enviar e-mail automático com dados de acesso e link do portal para o administrador
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setLogoPreview(null);
              }}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#072a33] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Cadastrando e Validando...' : 'Confirmar Cadastro'}
            </button>
          </div>
        </form>
      )}

      {/* Tabela de Corretoras */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500">Carregando corretoras...</div>
        ) : corretoras.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">Nenhuma corretora cadastrada.</div>
        ) : (
          <TableScrollContainer minWidth="1080px">
            <table className="w-full min-w-[1080px] text-left text-sm text-gray-700 border-separate border-spacing-0">
              <thead className="table-sticky-head bg-gray-50/95 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 table-sticky-col-head rounded-tl-xl">Corretora</th>
                  <th className="py-3.5 px-4 border-b border-gray-200">CNPJ & SUSEP</th>
                  <th className="py-3.5 px-4 border-b border-gray-200">Sócio & Contatos</th>
                  <th className="py-3.5 px-4 border-b border-gray-200">Bancário & PIX</th>
                  <th className="py-3.5 px-4 border-b border-gray-200">Documentos Anexados</th>
                  <th className="py-3.5 px-4 text-center border-b border-gray-200">Parceiros</th>
                  <th className="py-3.5 px-4 text-center border-b border-gray-200">Cotações</th>
                  <th className="py-3.5 px-4 text-center border-b border-gray-200">Status</th>
                  <th className="py-3.5 px-4 text-right border-b border-gray-200 rounded-tr-xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {corretoras.map((c) => {
                  const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.active;
                  const Icon = statusInfo.icon;
                  const isNet4Life = c.id === 'corretora_net4life_001';
                  const iconSrc = (c.logo_base64 && c.logo_mime_type)
                    ? `data:${c.logo_mime_type};base64,${c.logo_base64}`
                    : (c.whiteLabel?.iconUrl || (isNet4Life ? '/images/corretoras/net4life-icon.png' : c.whiteLabel?.logoUrl));

                  return (
                    <tr key={c.id} className="group hover:bg-gray-50/75 transition-colors">
                      <td className="py-4 px-4 table-sticky-col-cell">
                        <div className="flex items-center gap-3">
                          {iconSrc ? (
                            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center p-1 overflow-hidden shrink-0">
                              <img src={iconSrc} alt={c.nome_fantasia} className="max-w-full max-h-full object-contain" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                              {c.nome_fantasia.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900 flex items-center gap-2">
                              {c.nome_fantasia}
                              {isNet4Life && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase">
                                  <ShieldCheck size={11} /> Matriz #1
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{c.razao_social}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono text-xs text-gray-600 border-b border-gray-100">
                        <div>{formatarCnpj(c.cnpj)}</div>
                        {c.susep && (
                          <div className="text-[11px] text-gray-500 mt-0.5">SUSEP: <span className="font-medium text-gray-700">{c.susep}</span></div>
                        )}
                      </td>

                      {/* Sócio & Contatos */}
                      <td className="py-4 px-4 text-xs text-gray-600 border-b border-gray-100">
                        {c.socio_nome ? (
                          <div className="font-medium text-gray-900 flex items-center gap-1">
                            <UserCheck size={12} className="text-primary shrink-0" />
                            <span className="truncate max-w-[170px]" title={c.socio_nome}>{c.socio_nome}</span>
                          </div>
                        ) : null}
                        {c.socio_cpf && (
                          <div className="text-[11px] font-mono text-gray-500 mt-0.5">
                            CPF: {formatarCpf(c.socio_cpf)}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-gray-700 mt-1">
                          <Mail size={11} className="text-gray-400" />
                          <span className="truncate max-w-[170px]" title={c.socio_email || c.email}>{c.socio_email || c.email}</span>
                        </div>
                        {(c.telefone_cadastro || c.phone) && (
                          <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                            <Phone size={11} className="text-gray-400" />
                            <span>{c.telefone_cadastro || c.phone}</span>
                            {c.telefone_cadastro && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded uppercase">Cad</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Bancário & PIX */}
                      <td className="py-4 px-4 text-xs border-b border-gray-100">
                        {c.banco ? (
                          <div className="font-medium text-gray-900 flex items-center gap-1">
                            <Landmark size={12} className="text-primary shrink-0" />
                            <span className="truncate max-w-[160px]" title={c.banco}>{c.banco}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">Não informado</span>
                        )}
                        {c.agencia && c.conta && (
                          <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                            Ag {c.agencia} • Cc {c.conta}
                          </div>
                        )}
                        {c.pix_tipo_chave && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-[160px]" title={`Chave: ${c.pix_chave || '-'}`}>
                              PIX ({c.pix_tipo_chave}): {c.pix_chave}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Documentos Anexados (Contrato Social, Cartão CNPJ, Sócio, Comprovante) */}
                      <td className="py-4 px-4 text-xs border-b border-gray-100">
                        <div className="flex flex-col gap-1">
                          {/* Contrato Social */}
                          {c.has_contrato_social ? (
                            <a
                              href={`/api/admin/corretoras/${c.id}/contrato-social`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                              title="Visualizar Contrato Social"
                            >
                              <FileCheck size={11} /> Contrato Social
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Sem Contrato
                            </span>
                          )}

                          {/* Cartão CNPJ */}
                          {c.has_cartao_cnpj ? (
                            <a
                              href={`/api/admin/corretoras/${c.id}/cartao-cnpj`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded border border-sky-200 transition-colors"
                              title="Visualizar Cartão CNPJ"
                            >
                              <FileCheck size={11} /> Cartão CNPJ
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                              Sem Cartão CNPJ
                            </span>
                          )}

                          {/* RG/CPF Sócio */}
                          {c.has_socio_documento ? (
                            <a
                              href={`/api/admin/corretoras/${c.id}/socio-documento`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200 transition-colors"
                              title="Visualizar Documento do Sócio"
                            >
                              <UserCheck size={11} /> Doc. Sócios
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                              Sem Doc. Sócios
                            </span>
                          )}

                          {/* Comprovante Bancário */}
                          {c.has_comprovante_bancario ? (
                            <a
                              href={`/api/admin/corretoras/${c.id}/comprovante-bancario`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                              title="Visualizar Comprovante Bancário & PIX"
                            >
                              <CreditCard size={11} /> Comp. Bancário
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                              Sem Comp. Bancário
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center border-b border-gray-100">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full text-xs">
                          <Users size={12} className="text-gray-500" />
                          {c.partners_count}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center border-b border-gray-100">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded-full text-xs">
                          <Briefcase size={12} className="text-gray-500" />
                          {c.cotacoes_count}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center border-b border-gray-100">
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${statusInfo.color}15`,
                            color: statusInfo.color,
                          }}
                        >
                          <Icon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right border-b border-gray-100">
                        <Link
                          href={`/admin/corretoras/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Gerenciar <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollContainer>
        )}
      </div>
    </div>
  );
}
