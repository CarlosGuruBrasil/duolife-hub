'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Plus,
  Edit,
  Trash2,
  Eye,
  X,
  Check,
  Copy,
  AlertCircle,
  Save,
  Send,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  HelpCircle,
  FileCode,
} from 'lucide-react';
import type { EmailTemplate, EmailDispatchLog } from '@/lib/email-service';

export default function AdminEmailsPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'logs'>('templates');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [logs, setLogs] = useState<EmailDispatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Estados do Drawer do Editor
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formHtml, setFormHtml] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Estados do Modal de Prévia / Teste
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testStatusMsg, setTestStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const iframePreviewRef = useRef<HTMLIFrameElement>(null);
  const iframeViewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'templates') {
        const res = await fetch('/api/admin/emails/templates');
        const data = await res.json();
        if (data.ok) {
          setTemplates(data.templates || []);
        } else {
          setError(data.error || 'Erro ao carregar templates de e-mail.');
        }
      } else {
        const res = await fetch('/api/admin/emails/logs?limit=50');
        const data = await res.json();
        if (data.ok) {
          setLogs(data.logs || []);
        } else {
          setError(data.error || 'Erro ao carregar logs de envio.');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Falha de comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  }

  // Gera prévia com substituição de tags e variáveis simuladas
  function getPreviewHtml(html: string) {
    if (!html) return '<div style="padding: 20px; color: #64748b; font-family: sans-serif;">Nenhum conteúdo para exibir.</div>';

    const now = new Date();
    const dataHoje = now.toLocaleDateString('pt-BR');
    const horaHoje = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return html.replace(/\{\{([a-zA-Z0-9_-]+)(?:\|([^}]+))?\}\}/g, (_, key: string, fallback?: string) => {
      if (key === '-data-') return dataHoje;
      if (key === '-hora-') return horaHoje;
      if (key === '-data_hora-') return `${dataHoje} ${horaHoje}`;
      if (key === '-ano-') return String(now.getFullYear());
      if (key === '-aplicativo-') return 'DuoLife Hub';

      // Dados de simulação
      if (key === 'nome') return 'Dr. Carlos Eduardo';
      if (key === 'email') return 'carlos@exemplo.com.br';
      if (key === 'telefone') return '(47) 99123-4567';
      if (key === 'cotacao_id') return 'COT-2026-8942';
      if (key === 'produto_nome') return 'Seguro RC Profissional Advogado';
      if (key === 'cobertura') return '200.000,00';
      if (key === 'valor') return '1.250,00';
      if (key === 'parceiro_nome') return 'Harmonia Corretora de Seguros';
      if (key === 'codigo_venda') return 'HARMONIA_VIP';
      if (key === 'link_proposta') return 'https://duolife.com.br/contratar/demo';
      if (key === 'link_fatura') return 'https://duolife.com.br/pagamento/demo';

      if (fallback) return fallback;
      return `[${key}]`;
    });
  }

  // Atualiza iframe em tempo real
  useEffect(() => {
    if (isEditorOpen && iframePreviewRef.current) {
      const doc = iframePreviewRef.current.contentDocument || iframePreviewRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(getPreviewHtml(formHtml));
        doc.close();
      }
    }
  }, [isEditorOpen, formHtml]);

  // Atualiza iframe de visualização modal
  useEffect(() => {
    if (previewTemplate && iframeViewRef.current) {
      const doc = iframeViewRef.current.contentDocument || iframeViewRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(getPreviewHtml(previewTemplate.body_html));
        doc.close();
      }
    }
  }, [previewTemplate]);

  function handleOpenNew() {
    setEditingTemplate(null);
    setFormName('');
    setFormCode('');
    setFormSubject('');
    setFormIsActive(true);
    setFormHtml(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .btn { display: inline-block; background: #0e4a5a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">DuoLife Hub</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>!</p>
      <p>Escreva aqui o conteúdo da sua notificação ou comunicação com o segurado.</p>
    </div>
    <div class="footer">
      DuoLife Hub &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`);
    setIsEditorOpen(true);
    setError(null);
    setSuccess(null);
  }

  function handleOpenEdit(template: EmailTemplate) {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormCode(template.code);
    setFormSubject(template.subject);
    setFormHtml(template.body_html);
    setFormIsActive(template.is_active);
    setIsEditorOpen(true);
    setError(null);
    setSuccess(null);
  }

  function handleInsertVariable(varTag: string) {
    const textarea = editorTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textToInsert = `{{${varTag}}}`;
    const newContent = formHtml.substring(0, start) + textToInsert + formHtml.substring(end);
    setFormHtml(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 10);
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formSubject.trim() || !formHtml.trim()) {
      setError('Preencha todos os campos obrigatórios (nome, assunto e código HTML).');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isEditing = Boolean(editingTemplate?.id);
      const url = isEditing
        ? `/api/admin/emails/templates/${editingTemplate!.id}`
        : '/api/admin/emails/templates';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          code: formCode.trim() || undefined,
          subject: formSubject.trim(),
          body_html: formHtml,
          is_active: formIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao salvar template.');
      }

      setSuccess(`Template "${formName}" salvo com sucesso!`);
      setIsEditorOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar o template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string, name: string) {
    if (!confirm(`Tem certeza de que deseja excluir o template "${name}" permanentemente?`)) return;

    try {
      const res = await fetch(`/api/admin/emails/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao excluir.');
      setSuccess(`Template excluído.`);
      loadData();
    } catch (err: any) {
      setError(err?.message || 'Erro ao excluir o template.');
    }
  }

  async function handleSendTestEmail() {
    setSendingTest(true);
    setTestStatusMsg(null);
    try {
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: testEmailAddress.trim() || undefined,
          templateCode: previewTemplate ? previewTemplate.code : undefined,
          subject: previewTemplate ? previewTemplate.subject : formSubject,
          htmlContent: previewTemplate ? previewTemplate.body_html : formHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro no envio de teste.');
      setTestStatusMsg({ type: 'success', text: data.message });
    } catch (err: any) {
      setTestStatusMsg({ type: 'error', text: err?.message || 'Falha no disparo de teste.' });
    } finally {
      setSendingTest(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Mail className="size-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Modelos de E-mail</h1>
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
                Nodemailer SMTP Ativo
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              Gerencie templates HTML com tags dinâmicas <code className="text-primary font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{'{{variavel}}'}</code> e pré-visualização em tempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#0b3b48] transition"
          >
            <Plus className="size-4" />
            Novo Template
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
          <AlertCircle className="size-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-900 font-bold">&times;</button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1">{success}</div>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">&times;</button>
        </div>
      )}

      {/* Navegação por Abas */}
      <div className="flex items-center border-b border-gray-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'templates'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <FileCode className="size-4" />
          Templates Cadastrados ({templates.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Clock className="size-4" />
          Histórico de Envios (Auditoria)
        </button>
      </div>

      {/* Aba 1: Lista de Templates */}
      {activeTab === 'templates' && (
        <div className="flex flex-col gap-4">
          {/* Barra de Busca */}
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-3 size-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nome, código ou assunto..."
              className="w-full rounded-xl border border-gray-300 bg-white pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
            />
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-gray-200 rounded-2xl">
              <RefreshCw className="size-8 text-primary animate-spin mb-2" />
              <span className="text-sm font-semibold text-gray-600">Carregando modelos de e-mail...</span>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white border border-dashed border-gray-300 rounded-2xl text-center">
              <Mail className="size-12 text-gray-300 mb-3" />
              <p className="font-bold text-gray-700">Nenhum template encontrado</p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                {search ? 'Nenhum resultado corresponde à busca.' : 'Crie seu primeiro template HTML para notificações de seguros.'}
              </p>
              <button
                type="button"
                onClick={handleOpenNew}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="size-3.5" />
                Criar Template Agora
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-primary/30 transition-all flex flex-col justify-between gap-4 relative group"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-base text-gray-900 group-hover:text-primary transition line-clamp-1">
                        {tpl.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          tpl.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {tpl.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-mono text-[11px] bg-gray-50 border border-gray-200 text-gray-700 px-2 py-1 rounded-md w-fit max-w-full">
                      <span className="truncate">{tpl.code}</span>
                      <button
                        type="button"
                        onClick={() => copyCode(tpl.code)}
                        className="hover:text-primary transition shrink-0 ml-1"
                        title="Copiar código do template"
                      >
                        {copiedCode === tpl.code ? (
                          <Check className="size-3 text-emerald-600" />
                        ) : (
                          <Copy className="size-3 text-gray-400" />
                        )}
                      </button>
                    </div>

                    <div className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold text-gray-700">Assunto: </span>
                      <span className="line-clamp-1">{tpl.subject || '(sem assunto)'}</span>
                    </div>

                    {/* Chips de Variáveis */}
                    {Array.isArray(tpl.variables) && tpl.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tpl.variables.slice(0, 4).map((v) => (
                          <span
                            key={v}
                            className="text-[10px] font-mono bg-primary/5 text-primary border border-primary/15 px-1.5 py-0.5 rounded"
                          >
                            {'{{' + v + '}}'}
                          </span>
                        ))}
                        {tpl.variables.length > 4 && (
                          <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            +{tpl.variables.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(tpl)}
                      className="inline-flex items-center gap-1.5 text-gray-600 hover:text-primary font-medium hover:bg-gray-50 px-2 py-1 rounded transition"
                      title="Ver Prévia e Testar"
                    >
                      <Eye className="size-3.5" />
                      Visualizar
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(tpl)}
                        className="inline-flex items-center gap-1 text-gray-600 hover:text-primary font-medium hover:bg-gray-50 px-2 py-1 rounded transition"
                        title="Editar Template"
                      >
                        <Edit className="size-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id, tpl.name)}
                        className="inline-flex items-center text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                        title="Excluir Template"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aba 2: Histórico de Envios */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
            <h3 className="font-bold text-sm text-gray-900">Auditoria dos Últimos Disparos de E-mail</h3>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
            >
              <RefreshCw className="size-3" />
              Atualizar
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500 font-semibold text-sm">
              Carregando registros de auditoria...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              Nenhum disparo de e-mail registrado recentemente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Template</th>
                    <th className="p-3.5">Destinatário</th>
                    <th className="p-3.5">Assunto</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition">
                      <td className="p-3.5 whitespace-nowrap text-gray-500 font-mono">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3.5 font-mono text-primary font-semibold">
                        {log.template_code || '—'}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-gray-900">{log.recipient_name || 'Sem nome'}</div>
                        <div className="text-gray-500 font-mono text-[11px]">{log.recipient_email}</div>
                      </td>
                      <td className="p-3.5 text-gray-800 line-clamp-1 max-w-xs">{log.subject}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            log.status === 'sent'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : log.status === 'mocked'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {log.status === 'sent' ? 'Enviado (SMTP)' : log.status === 'mocked' ? 'Simulado (Dev)' : 'Falhou'}
                        </span>
                        {log.error_message && (
                          <div className="text-[10px] text-red-600 mt-1 max-w-xs truncate" title={log.error_message}>
                            {log.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drawer / Modal Lateral: Editor de Templates Split-View */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div
            className="w-full max-w-6xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Drawer */}
            <header className="px-6 py-4 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                  <Mail className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 leading-tight">
                    {editingTemplate?.id ? 'Editar Modelo de E-mail' : 'Novo Modelo de E-mail'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Edite o código HTML à esquerda e acompanhe a renderização em tempo real à direita.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-lg p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition"
              >
                <X className="size-5" />
              </button>
            </header>

            {/* Corpo do Editor Split-View */}
            <form onSubmit={handleSaveTemplate} className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
              {/* Lado Esquerdo: Formulário e Editor de Código */}
              <div className="w-full lg:w-1/2 p-6 flex flex-col gap-4 overflow-y-auto border-r border-gray-200 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase">Nome do Template *</label>
                    <input
                      required
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ex: Confirmação de Apólice"
                      className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase">Código Único (Slug)</label>
                    <input
                      type="text"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      placeholder="Ex: apolice_confirmada"
                      className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase">Assunto do E-mail *</label>
                  <input
                    required
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="Ex: Sua apólice DuoLife #{{cotacao_id}} já está ativa!"
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                </div>

                {/* Toolbar de Chips de Variáveis */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 uppercase">Inserir Variáveis Dinâmicas:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'nome',
                      'email',
                      'telefone',
                      'cotacao_id',
                      'produto_nome',
                      'valor',
                      'cobertura',
                      'parceiro_nome',
                      'link_proposta',
                      'link_fatura',
                      '-data-',
                      '-hora-',
                      '-ano-',
                    ].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleInsertVariable(v)}
                        className="text-[11px] font-mono bg-gray-100 hover:bg-primary/10 text-gray-700 hover:text-primary border border-gray-200 px-2 py-1 rounded-md transition"
                        title={`Clique para inserir {{${v}}}`}
                      >
                        {'{{' + v + '}}'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Editor de HTML */}
                <div className="flex-1 flex flex-col gap-1.5 min-h-[350px]">
                  <label className="text-xs font-bold text-gray-700 uppercase">Código HTML do Template *</label>
                  <textarea
                    ref={editorTextareaRef}
                    required
                    value={formHtml}
                    onChange={(e) => setFormHtml(e.target.value)}
                    className="w-full flex-1 p-3 font-mono text-xs border border-gray-300 rounded-xl bg-gray-50 focus:bg-white text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs resize-none"
                    spellCheck="false"
                  />
                </div>
              </div>

              {/* Lado Direito: Pré-visualização em Iframe */}
              <div className="w-full lg:w-1/2 p-6 flex flex-col gap-4 overflow-y-auto bg-gray-50/70 border-t lg:border-t-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Prévia em Tempo Real (Sandbox)
                  </h4>
                  <span className="text-[11px] text-gray-500">Dados simulados realisticamente</span>
                </div>

                <div className="flex-1 min-h-[450px] bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
                  <div className="bg-gray-100 border-b border-gray-200 px-4 py-2.5 text-xs text-gray-600 font-sans flex flex-col gap-1">
                    <div><strong className="text-gray-800">De:</strong> DuoLife Hub &lt;noreply@duolife.com.br&gt;</div>
                    <div><strong className="text-gray-800">Assunto:</strong> {getPreviewHtml(formSubject) || '(sem assunto)'}</div>
                  </div>
                  <iframe
                    ref={iframePreviewRef}
                    title="Prévia do E-mail"
                    className="flex-1 w-full border-none min-h-[400px]"
                    sandbox="allow-same-origin"
                  />
                </div>

                {/* Teste Rápido de Disparo */}
                <div className="border border-gray-200 bg-white p-4 rounded-xl flex flex-col gap-2 shadow-xs">
                  <span className="text-xs font-bold text-gray-800">Testar envio para um e-mail:</span>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmailAddress}
                      onChange={(e) => setTestEmailAddress(e.target.value)}
                      placeholder="Deixe vazio para enviar para sua própria conta"
                      className="flex-1 rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={sendingTest}
                      onClick={handleSendTestEmail}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50 transition"
                    >
                      <Send className="size-3" />
                      {sendingTest ? 'Enviando...' : 'Enviar Teste'}
                    </button>
                  </div>
                  {testStatusMsg && (
                    <div className={`text-xs font-semibold mt-1 ${testStatusMsg.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {testStatusMsg.text}
                    </div>
                  )}
                </div>
              </div>
            </form>

            {/* Footer do Drawer */}
            <footer className="px-6 py-4 border-t border-gray-200 bg-white flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-primary hover:bg-[#0b3b48] rounded-xl shadow-xs transition disabled:opacity-50"
              >
                <Save className="size-4" />
                {saving ? 'Salvando...' : 'Salvar Template'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal de Visualização Rápida */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[90vh]">
            <header className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="font-bold text-base text-gray-900">{previewTemplate.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{previewTemplate.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="p-1 text-gray-400 hover:text-gray-900 rounded-lg"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="p-4 bg-gray-100 border-b border-gray-200 text-xs text-gray-700 flex flex-col gap-1">
              <div><strong>Assunto:</strong> {getPreviewHtml(previewTemplate.subject)}</div>
            </div>

            <div className="flex-1 p-4 min-h-[380px] bg-white">
              <iframe
                ref={iframeViewRef}
                title="Visualizador de Template"
                className="w-full h-full border-none min-h-[380px]"
                sandbox="allow-same-origin"
              />
            </div>

            <footer className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="text-xs text-gray-500">
                Última atualização: {new Date(previewTemplate.updated_at).toLocaleDateString('pt-BR')}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const t = previewTemplate;
                    setPreviewTemplate(null);
                    handleOpenEdit(t);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-primary hover:underline"
                >
                  Editar Código
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="px-4 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50"
                >
                  Fechar
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
