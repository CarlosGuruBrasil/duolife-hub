'use client';

import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/toast';
import {
  Bot,
  Key,
  ShieldCheck,
  Copy,
  Check,
  Plus,
  RefreshCw,
  Power,
  ExternalLink,
  Info,
  AlertTriangle,
  Zap,
  Terminal,
  Activity,
  Layers,
} from 'lucide-react';

interface McpKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_minute: number;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface McpStats {
  totalKeys: number;
  activeKeys: number;
  totalRequests: number;
  successRequests: number;
  rejectedRequests: number;
}

const AVAILABLE_SCOPES: Array<{ id: string; label: string; desc: string }> = [
  {
    id: 'insurance:catalog:read',
    label: 'Catálogo de Produtos',
    desc: 'Consultar seguros e ramos habilitados (insurance_list_products, insurance_get_product)',
  },
  {
    id: 'insurance:quote',
    label: 'Cálculo & Cotação',
    desc: 'Simular valores pelo motor oficial e confirmar cotação (quote_simulate, quote_confirm)',
  },
  {
    id: 'insurance:sale:create',
    label: 'Sessão de Venda & Coleta',
    desc: 'Criar sessão comercial e atualizar dados do cliente (sales_start, sales_update, sales_handoff)',
  },
  {
    id: 'insurance:sale:read',
    label: 'Consulta de Status',
    desc: 'Verificar status da venda e próximo passo recomendado (sales_next_step, sale_status)',
  },
  {
    id: 'insurance:contract:create',
    label: 'Geração de Contrato',
    desc: 'Gerar minuta oficial ZapSign e verificar assinaturas (contract_create, contract_status)',
  },
  {
    id: 'insurance:payment:read',
    label: 'Informações de Pagamento',
    desc: 'Recuperar carnê Asaas e código PIX após assinatura (payment_get)',
  },
];

export default function McpKeysTab() {
  const [keys, setKeys] = useState<McpKeyItem[]>([]);
  const [stats, setStats] = useState<McpStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Modal / Formulário de Criação
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(300);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    AVAILABLE_SCOPES.map((s) => s.id)
  );

  // Chave recém-gerada para exibição única
  const [lastGeneratedKey, setLastGeneratedKey] = useState<{
    token: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    fetchMcpKeys();
  }, []);

  async function fetchMcpKeys() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/mcp/keys');
      const data = await res.json();
      if (res.ok) {
        setKeys(data.keys || []);
        setStats(data.stats || null);
      } else {
        toast.error(data.error || 'Falha ao carregar chaves MCP');
      }
    } catch {
      toast.error('Erro de conexão ao carregar chaves MCP');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, identifier: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedText(identifier);
      toast.success('Copiado para a área de transferência!');
      setTimeout(() => setCopiedText(null), 2500);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error('Informe o nome identificador da chave');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/admin/mcp/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: selectedScopes,
          rateLimitPerMinute: newKeyRateLimit,
        }),
      });

      const data = await res.json();
      if (res.ok && data.rawToken) {
        setLastGeneratedKey({
          token: data.rawToken,
          name: data.key.name,
        });
        toast.success('Chave de acesso MCP gerada com sucesso!');
        setShowCreateModal(false);
        setNewKeyName('');
        fetchMcpKeys();
      } else {
        toast.error(data.error || 'Erro ao gerar chave de API');
      }
    } catch {
      toast.error('Erro de comunicação com o servidor.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggleStatus(keyItem: McpKeyItem) {
    const nextStatus = !keyItem.is_active;
    try {
      const res = await fetch('/api/admin/mcp/keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: keyItem.id,
          isActive: nextStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          nextStatus ? 'Chave reativada com sucesso!' : 'Chave revogada com sucesso!'
        );
        setKeys((prev) =>
          prev.map((k) => (k.id === keyItem.id ? { ...k, is_active: nextStatus } : k))
        );
      } else {
        toast.error(data.error || 'Falha ao atualizar status da chave');
      }
    } catch {
      toast.error('Erro de comunicação.');
    }
  }

  function toggleScope(scopeId: string) {
    if (selectedScopes.includes(scopeId)) {
      if (selectedScopes.length === 1) {
        toast.error('Selecione ao menos um escopo');
        return;
      }
      setSelectedScopes(selectedScopes.filter((id) => id !== scopeId));
    } else {
      setSelectedScopes([...selectedScopes, scopeId]);
    }
  }

  const endpointUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/mcp`
      : 'https://hub.duolife.com.br/api/mcp';

  return (
    <div className="space-y-6">
      {/* 1. Header do MCP */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-[#0e4a5a]">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                  Model Context Protocol
                </span>
                <span className="text-xs text-gray-500 font-medium">Protocol Version: 2024-11-05</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mt-1">
                Chaves de Acesso MCP (Agente WhatsApp & IA)
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Gerencie credenciais seguras Server-to-Server com controle de escopos (RBAC) e rate limit para assistentes virtuais de venda.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchMcpKeys}
              disabled={loading}
              className="px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-colors flex items-center gap-1.5"
              title="Recarregar chaves"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 bg-[#0e4a5a] hover:bg-[#072a33] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Gerar Nova Chave MCP
            </button>
          </div>
        </div>

        {/* Endpoint Oficial */}
        <div className="mt-5 pt-5 border-t border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50/70 p-3.5 rounded-xl border border-gray-200/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Terminal className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-xs font-semibold text-gray-600 shrink-0">Endpoint Protocolar:</span>
            <code className="text-xs font-mono font-bold text-[#0e4a5a] truncate select-all">
              {endpointUrl}
            </code>
          </div>
          <button
            onClick={() => handleCopy(endpointUrl, 'endpoint')}
            className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-200 transition-colors flex items-center gap-1.5 shrink-0 self-start md:self-auto"
          >
            {copiedText === 'endpoint' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-bold">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                Copiar Endpoint
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Banner de Chave Recém-Gerada (Exibição Única) */}
      {lastGeneratedKey && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-top-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-emerald-700 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-emerald-950">
                  Nova Chave Gerada para: "{lastGeneratedKey.name}"
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Copie o token abaixo agora. Por segurança criptográfica em repouso (SHA-256), a chave secreta completa não será exibida novamente.
                </p>
              </div>
            </div>
            <button
              onClick={() => setLastGeneratedKey(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
            >
              Fechar aviso
            </button>
          </div>

          <div className="mt-4 flex flex-col md:flex-row items-stretch md:items-center gap-2.5 bg-white p-2.5 rounded-xl border border-emerald-200">
            <code className="text-sm font-mono font-bold text-gray-900 px-2 py-1 select-all break-all flex-1">
              {lastGeneratedKey.token}
            </code>
            <button
              onClick={() => handleCopy(lastGeneratedKey.token, 'new_token')}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs"
            >
              {copiedText === 'new_token' ? (
                <>
                  <Check className="w-4 h-4" />
                  Copiada com Sucesso!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copiar Chave Secreta
                </>
              )}
            </button>
          </div>

          <div className="mt-4 text-xs text-emerald-900 bg-emerald-100/60 p-3 rounded-lg border border-emerald-200">
            <p className="font-semibold">Exemplo de cabeçalho HTTP no host MCP / WhatsApp Bot:</p>
            <pre className="mt-1 font-mono text-[11px] text-gray-800 bg-white/80 p-2 rounded border border-emerald-200 select-all overflow-x-auto">
              {`Authorization: Bearer ${lastGeneratedKey.token}`}
            </pre>
          </div>
        </div>
      )}

      {/* 3. Cards de Resumo & Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold">Chaves Cadastradas</span>
            <Key className="w-4 h-4 text-[#0e4a5a]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats?.totalKeys ?? keys.length}</span>
            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {stats?.activeKeys ?? keys.filter((k) => k.is_active).length} ativas
            </span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold">Requisições MCP</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats?.totalRequests ?? 0}</span>
            <span className="text-xs text-gray-500 font-medium">auditoria ativa</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold">Produtos Homologados</span>
            <Layers className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">5 Ramos</span>
            <span className="text-xs text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              Catálogo RC
            </span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold">Segurança & Regras</span>
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">100%</span>
            <span className="text-xs text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              A IA não precifica
            </span>
          </div>
        </div>
      </div>

      {/* 4. Tabela de Chaves */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Chaves de API Cadastradas no Banco</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Cada chave possui hash SHA-256 e escopos atribuídos no momento da geração.
            </p>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Total: {keys.length} chave(s)
          </span>
        </div>

        {keys.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Key className="w-10 h-10 text-gray-300 mx-auto" />
            <h4 className="text-sm font-bold text-gray-700">Nenhuma chave MCP cadastrada</h4>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Clique no botão "Gerar Nova Chave MCP" para criar a primeira chave de autenticação para o agente de IA do WhatsApp.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-4 py-2 bg-[#0e4a5a] text-white rounded-xl text-xs font-bold hover:bg-[#072a33] transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Gerar Primeira Chave
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                <tr>
                  <th className="py-3 px-4">Nome do Cliente / Agente</th>
                  <th className="py-3 px-4">Prefixo Público</th>
                  <th className="py-3 px-4">Escopos Ativos</th>
                  <th className="py-3 px-4">Rate Limit</th>
                  <th className="py-3 px-4">Último Uso</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{k.name}</div>
                      <div className="text-[11px] text-gray-500">
                        Criada em {new Date(k.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-gray-700">
                      <code>{k.key_prefix}...</code>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {k.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200"
                            title={scope}
                          >
                            {scope.replace('insurance:', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-700 font-medium">
                      {k.rate_limit_per_minute} req/min
                    </td>
                    <td className="py-3.5 px-4 text-gray-500">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleString('pt-BR')
                        : 'Nunca utilizada'}
                    </td>
                    <td className="py-3.5 px-4">
                      {k.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Revogada
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleToggleStatus(k)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          k.is_active
                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {k.is_active ? 'Revogar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Chave de Desenvolvimento / Testes Locais */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
              Chave de Homologação / Desenvolvimento Local (Mock)
            </h4>
            <p className="text-xs text-amber-800 mt-1">
              Para desenvolvimento offline ou suíte de testes locais, utilize o token padrão embutido com todos os 6 escopos de seguros:
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <code className="text-xs font-mono font-bold bg-white text-gray-900 px-2.5 py-1 rounded-md border border-amber-300 select-all">
                dlmcp_live_dev_test_key_001_secret
              </code>
              <button
                onClick={() => handleCopy('dlmcp_live_dev_test_key_001_secret', 'mock_dev')}
                className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-md border border-amber-300 transition-colors flex items-center gap-1"
              >
                {copiedText === 'mock_dev' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Modal de Geração de Nova Chave */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 text-[#0e4a5a] rounded-lg border border-teal-200">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Gerar Nova Chave de Acesso MCP</h3>
                  <p className="text-xs text-gray-500">Criar credencial Server-to-Server com controle de escopo</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="mt-5 space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Nome do Agente ou Aplicação *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Agente WhatsApp — Carlos Corretor"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#0e4a5a] focus:ring-1 focus:ring-[#0e4a5a] transition-all outline-hidden text-gray-900"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Nome identificador visível nos registros de auditoria do sistema.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Taxa Máxima de Requisições (Rate Limit)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={10}
                    value={newKeyRateLimit}
                    onChange={(e) => setNewKeyRateLimit(Number(e.target.value))}
                    className="w-32 px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-bold focus:bg-white focus:border-[#0e4a5a] outline-hidden"
                  />
                  <span className="text-xs text-gray-600">requisições por minuto (janela deslizante)</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-700">
                    Escopos de Acesso Autorizados ({selectedScopes.length}/{AVAILABLE_SCOPES.length})
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedScopes(
                        selectedScopes.length === AVAILABLE_SCOPES.length
                          ? ['insurance:catalog:read']
                          : AVAILABLE_SCOPES.map((s) => s.id)
                      )
                    }
                    className="text-xs text-[#0e4a5a] font-bold hover:underline"
                  >
                    {selectedScopes.length === AVAILABLE_SCOPES.length
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </button>
                </div>

                <div className="space-y-2 border border-gray-200 rounded-xl p-3 bg-gray-50/50 max-h-56 overflow-y-auto">
                  {AVAILABLE_SCOPES.map((scope) => {
                    const isChecked = selectedScopes.includes(scope.id);
                    return (
                      <label
                        key={scope.id}
                        className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors border ${
                          isChecked
                            ? 'bg-teal-50/60 border-teal-200'
                            : 'bg-white border-gray-200 hover:bg-gray-100/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleScope(scope.id)}
                          className="mt-0.5 rounded text-[#0e4a5a] focus:ring-[#0e4a5a]"
                        />
                        <div className="flex-1 text-xs">
                          <div className="font-bold text-gray-900 flex items-center justify-between">
                            <span>{scope.label}</span>
                            <code className="text-[10px] font-mono text-gray-500">{scope.id}</code>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-0.5">{scope.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0e4a5a] hover:bg-[#072a33] transition-all shadow-xs flex items-center gap-2 disabled:opacity-60"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Gerando Chave Criptografada...
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      Criar Chave MCP
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
