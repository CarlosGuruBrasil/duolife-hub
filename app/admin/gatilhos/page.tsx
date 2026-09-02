'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  GitFork,
  GitBranch,
  Zap,
  Sliders,
  Mail,
  UserCheck,
  Globe,
  Plus,
  Trash2,
  Edit3,
  Save,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FolderKanban,
  Search,
  GripVertical,
  Check,
  AlertCircle,
  Clock,
  CheckCircle2,
  Users,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type {
  TipoNo,
  NoArvore,
  ArvoreDecisao,
  AutomationTriggerRecord,
  AutomationTriggerLogRecord,
  DestinatarioConfig,
} from '@/lib/triggers/types';

interface EventoInfo {
  codigo: string;
  nome: string;
  descricao: string;
}

interface TemplateOption {
  id: string;
  code: string;
  name: string;
}

export default function AdminGatilhosPage() {
  const [activeViewTab, setActiveViewTab] = useState<'canvas' | 'logs'>('canvas');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Catálogo de eventos e templates
  const [eventosDisponiveis, setEventosDisponiveis] = useState<EventoInfo[]>([]);
  const [templatesDisponiveis, setTemplatesDisponiveis] = useState<TemplateOption[]>([]);

  // Árvores de Decisão
  const [arvores, setArvores] = useState<ArvoreDecisao[]>([]);
  const [arvoreAtivaId, setArvoreAtivaId] = useState<string | null>(null);
  const [buscaArvore, setBuscaArvore] = useState('');

  // Logs de Auditoria
  const [logs, setLogs] = useState<AutomationTriggerLogRecord[]>([]);

  // Modais
  const [modalNovaArvore, setModalNovaArvore] = useState(false);
  const [nomeNovaArvore, setNomeNovaArvore] = useState('');
  const [eventoNovo, setEventoNovo] = useState('PAGAMENTO_CONFIRMADO');

  const [modalAdicionarPaiId, setModalAdicionarPaiId] = useState<string | null>(null);
  const [noEmEdicao, setNoEmEdicao] = useState<NoArvore | null>(null);

  // Estado do Canvas (Pan & Zoom)
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Arraste individual de nós (galhos)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0 });
  const [snapGuias, setSnapGuias] = useState<{ x?: number; y?: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);
    setMensagemErro(null);
    try {
      // 1. Carrega árvores cadastradas e catálogo de eventos
      const resGatilhos = await fetch('/api/admin/gatilhos');
      const dataGatilhos = await resGatilhos.json();

      if (dataGatilhos.ok) {
        setEventosDisponiveis(dataGatilhos.eventosDisponiveis || []);
        const rawTriggers: AutomationTriggerRecord[] = dataGatilhos.triggers || [];

        const parsedArvores: ArvoreDecisao[] = rawTriggers.map((t) => ({
          id: t.id,
          codigo: t.code,
          nome: t.name,
          descricao: t.description || undefined,
          gatilhoCodigo: t.event_type,
          ativo: t.is_active,
          nos: t.tree_definition?.nos || [],
        }));

        setArvores(parsedArvores);
        if (parsedArvores.length > 0 && !arvoreAtivaId) {
          setArvoreAtivaId(parsedArvores[0].id);
        }
      }

      // 2. Carrega templates de e-mail para o seletor das ações
      const resTemplates = await fetch('/api/admin/emails/templates');
      const dataTemplates = await resTemplates.json();
      if (dataTemplates.ok) {
        setTemplatesDisponiveis(dataTemplates.templates || []);
      }

      // 3. Carrega logs de execução
      const resLogs = await fetch('/api/admin/gatilhos/logs?limit=50');
      const dataLogs = await resLogs.json();
      if (dataLogs.ok) {
        setLogs(dataLogs.logs || []);
      }
    } catch (err: any) {
      setMensagemErro(err?.message || 'Falha ao carregar configurações de gatilhos.');
    } finally {
      setLoading(false);
    }
  }

  const arvoreAtiva = arvores.find((a) => a.id === arvoreAtivaId);
  const nosAtuais = arvoreAtiva ? arvoreAtiva.nos : [];

  // Criação de Nova Árvore
  function handleCriarNovaArvore() {
    const eventoObj = eventosDisponiveis.find((e) => e.codigo === eventoNovo);
    const nomeFinal = nomeNovaArvore.trim() || (eventoObj ? eventoObj.nome : 'Novo Fluxo de Automação');
    const novoTreeId = `tree_${Date.now()}`;

    const noRaiz: NoArvore = {
      id: `root_${Date.now()}`,
      tipo: 'GATILHO',
      titulo: nomeFinal,
      subtitulo: `Evento: ${eventoNovo}`,
      parentId: null,
      ativo: true,
      posicaoX: 520,
      posicaoY: 60,
      configuracao: {
        gatilho_codigo: eventoNovo,
      },
    };

    const novaArvore: ArvoreDecisao = {
      id: novoTreeId,
      nome: nomeFinal,
      gatilhoCodigo: eventoNovo,
      ativo: true,
      nos: [noRaiz],
    };

    setArvores((prev) => [novaArvore, ...prev]);
    setArvoreAtivaId(novoTreeId);
    setModalNovaArvore(false);
    setNomeNovaArvore('');
    setMensagemSucesso(`Árvore "${nomeFinal}" criada com sucesso! Configure os galhos e clique em Salvar.`);
  }

  // Exclusão de Árvore
  async function handleExcluirArvore(treeId: string) {
    const tree = arvores.find((a) => a.id === treeId);
    if (!tree) return;
    if (!confirm(`Tem certeza de que deseja excluir a árvore "${tree.nome}"?`)) return;

    try {
      await fetch(`/api/admin/gatilhos/${treeId}`, { method: 'DELETE' });
      const restantes = arvores.filter((a) => a.id !== treeId);
      setArvores(restantes);
      if (arvoreAtivaId === treeId) {
        setArvoreAtivaId(restantes[0]?.id || null);
      }
      setMensagemSucesso(`Árvore "${tree.nome}" removida.`);
    } catch (err: any) {
      setMensagemErro(err?.message || 'Erro ao excluir a árvore.');
    }
  }

  // Adição de Nó Filho (Ramificação)
  function handleAdicionarNo(parentId: string, tipo: TipoNo) {
    if (!arvoreAtivaId) return;

    let titulo = 'Nova Ação';
    let subtitulo = '';
    let configuracao: any = {};

    if (tipo === 'LOGICO_E') {
      titulo = "Operador 'E' (AND)";
      subtitulo = 'Todas as ramificações filhas devem ser satisfeitas';
    } else if (tipo === 'LOGICO_OU') {
      titulo = "Operador 'OU' (OR)";
      subtitulo = 'Dispara se qualquer ramificação filha for atendida';
    } else if (tipo === 'CONDICAO_SE') {
      titulo = "Condição 'SE' (IF)";
      subtitulo = 'Filtra por atributo do segurado ou cotação';
      configuracao = {
        campo: 'cotacao.premio_final',
        operador: 'MAIOR',
        valor_comparacao: '500',
      };
    } else if (tipo === 'ACAO_EMAIL') {
      titulo = 'Ação: Enviar E-mail';
      subtitulo = 'Dispara template de e-mail formatado';
      configuracao = {
        template_id: templatesDisponiveis[0]?.code || 'boas_vindas',
        destinatarios: [
          { destinatario_tipo: 'CLIENTE', destinatario_email: '', destinatario_nome: '' },
        ],
      };
    } else if (tipo === 'ACAO_STATUS') {
      titulo = 'Ação: Atualizar Status';
      subtitulo = 'Muda o status da cotação no sistema';
      configuracao = { status: 'assinado' };
    } else if (tipo === 'ACAO_WEBHOOK') {
      titulo = 'Ação: Webhook Externo';
      subtitulo = 'Envia dados via HTTP POST';
      configuracao = { webhook_url: 'https://exemplo.com/webhook', webhook_method: 'POST' };
    }

    const parentNode = nosAtuais.find((n) => n.id === parentId);
    const parentPos = parentNode?.posicaoX !== undefined ? { x: parentNode.posicaoX, y: parentNode.posicaoY || 60 } : { x: 520, y: 60 };

    const novoNo: NoArvore = {
      id: `no_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tipo,
      titulo,
      subtitulo,
      parentId,
      ativo: true,
      posicaoX: parentPos.x,
      posicaoY: parentPos.y + 160,
      configuracao,
    };

    setArvores((prev) =>
      prev.map((a) => (a.id === arvoreAtivaId ? { ...a, nos: [...a.nos, novoNo] } : a))
    );

    setModalAdicionarPaiId(null);
  }

  // Remoção de Nó e Filhos em Cascata
  function handleRemoverNo(noId: string) {
    if (!arvoreAtivaId) return;
    const no = nosAtuais.find((n) => n.id === noId);
    if (no?.tipo === 'GATILHO') {
      alert('O Nó Raiz (Gatilho) não pode ser removido.');
      return;
    }

    const idsParaRemover = new Set<string>([noId]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      nosAtuais.forEach((n) => {
        if (n.parentId && idsParaRemover.has(n.parentId) && !idsParaRemover.has(n.id)) {
          idsParaRemover.add(n.id);
          mudou = true;
        }
      });
    }

    setArvores((prev) =>
      prev.map((a) =>
        a.id === arvoreAtivaId ? { ...a, nos: a.nos.filter((n) => !idsParaRemover.has(n.id)) } : a
      )
    );
  }

  // Salvar Nó Editado
  function handleSalvarEdicaoNo(noAtualizado: NoArvore) {
    if (!arvoreAtivaId) return;
    setArvores((prev) =>
      prev.map((a) =>
        a.id === arvoreAtivaId
          ? { ...a, nos: a.nos.map((n) => (n.id === noAtualizado.id ? noAtualizado : n)) }
          : a
      )
    );
    setNoEmEdicao(null);
  }

  // Salvar Árvore Inteira no Banco de Dados
  async function handleSalvarArvoreAtual() {
    if (!arvoreAtiva) return;
    setSalvando(true);
    setMensagemSucesso(null);
    setMensagemErro(null);

    try {
      const isExistingOnServer = !arvoreAtiva.id.startsWith('tree_custom_');
      const url = isExistingOnServer
        ? `/api/admin/gatilhos/${arvoreAtiva.id}`
        : '/api/admin/gatilhos';
      const method = isExistingOnServer ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: arvoreAtiva.nome,
          description: arvoreAtiva.descricao,
          event_type: arvoreAtiva.gatilhoCodigo,
          is_active: arvoreAtiva.ativo,
          tree_definition: { nos: arvoreAtiva.nos },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao salvar árvore.');

      setMensagemSucesso(`Árvore de decisão "${arvoreAtiva.nome}" salva com sucesso!`);
    } catch (err: any) {
      setMensagemErro(err?.message || 'Erro ao persistir árvore no banco de dados.');
    } finally {
      setSalvando(false);
    }
  }

  // Algoritmo de Cálculo de Posições e Conexões Bézier
  const noRaiz = nosAtuais.find((n) => n.tipo === 'GATILHO');

  function calcularPosicoesEConexoes() {
    if (!noRaiz) return { posicoes: new Map<string, { x: number; y: number }>(), conexoes: [] };

    const posicoes = new Map<string, { x: number; y: number }>();
    const conexoes: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; fromId: string; toId: string }> = [];

    const mapaFilhos = new Map<string, NoArvore[]>();
    nosAtuais.forEach((n) => {
      if (n.parentId) {
        const arr = mapaFilhos.get(n.parentId) || [];
        arr.push(n);
        mapaFilhos.set(n.parentId, arr);
      }
    });

    const LARGURA_NO = 280;
    const ALTURA_NO = 110;
    const ESPACAMENTO_X = 50;
    const ESPACAMENTO_Y = 160;

    function getSubtreeWidth(nodeId: string): number {
      const children = mapaFilhos.get(nodeId) || [];
      if (children.length === 0) return LARGURA_NO;
      let total = 0;
      children.forEach((c) => {
        total += getSubtreeWidth(c.id);
      });
      return Math.max(LARGURA_NO, total + (children.length - 1) * ESPACAMENTO_X);
    }

    function posicionarSubtree(nodeId: string, currentX: number, currentY: number) {
      const nodeObj = nosAtuais.find((n) => n.id === nodeId);
      const children = mapaFilhos.get(nodeId) || [];

      const posX = nodeObj && nodeObj.posicaoX !== undefined ? nodeObj.posicaoX : currentX;
      const posY = nodeObj && nodeObj.posicaoY !== undefined ? nodeObj.posicaoY : currentY;

      posicoes.set(nodeId, { x: posX, y: posY });

      if (children.length > 0) {
        const totalW = getSubtreeWidth(nodeId);
        let startX = currentX - totalW / 2 + LARGURA_NO / 2;

        children.forEach((child) => {
          const childW = getSubtreeWidth(child.id);
          const childCenterX = startX + childW / 2 - LARGURA_NO / 2;
          const childY = currentY + ESPACAMENTO_Y;

          posicionarSubtree(child.id, childCenterX, childY);

          const childNodeObj = nosAtuais.find((n) => n.id === child.id);
          const childPosX = childNodeObj && childNodeObj.posicaoX !== undefined ? childNodeObj.posicaoX : childCenterX;
          const childPosY = childNodeObj && childNodeObj.posicaoY !== undefined ? childNodeObj.posicaoY : childY;

          conexoes.push({
            from: { x: posX + LARGURA_NO / 2, y: posY + ALTURA_NO },
            to: { x: childPosX + LARGURA_NO / 2, y: childPosY },
            fromId: nodeId,
            toId: child.id,
          });

          startX += childW + ESPACAMENTO_X;
        });
      }
    }

    posicionarSubtree(noRaiz.id, 560, 60);

    return { posicoes, conexoes };
  }

  const { posicoes, conexoes } = calcularPosicoesEConexoes();

  // Handlers do Canvas: Pan
  function handleMouseDownCanvas(e: React.MouseEvent) {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-area')) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  }

  // Handlers de Drag dos Nós
  function handleMouseDownNode(e: React.MouseEvent, node: NoArvore, pos: { x: number; y: number }) {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
    const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;

    setDraggingNodeId(node.id);
    setNodeDragStart({
      x: mouseX - pos.x,
      y: mouseY - pos.y,
    });
  }

  function handleMouseMoveCanvas(e: React.MouseEvent) {
    if (isDraggingCanvas) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (draggingNodeId && canvasRef.current && arvoreAtivaId) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
      const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;

      const rawX = Math.round(mouseX - nodeDragStart.x);
      const rawY = Math.round(mouseY - nodeDragStart.y);

      // Snap magnético em grid de 24px
      const GRID_SIZE = 24;
      let finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
      let finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;

      // Snap de alinhamento com nós vizinhos
      const THRESHOLD = 14;
      const LARGURA_NO = 280;
      let guideX: number | undefined = undefined;

      nosAtuais.forEach((other) => {
        if (other.id === draggingNodeId) return;
        const otherPos = posicoes.get(other.id);
        if (!otherPos) return;

        if (Math.abs(finalX - otherPos.x) < THRESHOLD) {
          finalX = otherPos.x;
          guideX = otherPos.x + LARGURA_NO / 2;
        }
      });

      setSnapGuias(guideX !== undefined ? { x: guideX } : null);

      setArvores((prev) =>
        prev.map((a) =>
          a.id === arvoreAtivaId
            ? {
                ...a,
                nos: a.nos.map((n) =>
                  n.id === draggingNodeId ? { ...n, posicaoX: finalX, posicaoY: finalY } : n
                ),
              }
            : a
        )
      );
    }
  }

  function handleMouseUpCanvas() {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
    setSnapGuias(null);
  }

  function resetLayoutAuto() {
    if (!arvoreAtivaId) return;
    setArvores((prev) =>
      prev.map((a) =>
        a.id === arvoreAtivaId
          ? {
              ...a,
              nos: a.nos.map((n) => ({ ...n, posicaoX: undefined, posicaoY: undefined })),
            }
          : a
      )
    );
  }

  const arvoresFiltradas = arvores.filter(
    (a) =>
      a.nome.toLowerCase().includes(buscaArvore.toLowerCase()) ||
      a.gatilhoCodigo.toLowerCase().includes(buscaArvore.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <GitFork className="size-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Gatilhos & Árvores de Decisão</h1>
              <span className="rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 px-2.5 py-0.5 text-xs font-semibold">
                Canvas Interativo com Grid 24px
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              Configure fluxos visuais com Nó Raiz, operadores lógicos <code className="text-primary font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">E / OU</code>, filtros condicionais <code className="text-primary font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">SE</code> e múltiplos disparos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setModalNovaArvore(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 transition"
          >
            <Plus className="size-4 text-primary" />
            Nova Árvore
          </button>

          {arvoreAtiva && (
            <button
              type="button"
              onClick={handleSalvarArvoreAtual}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-[#0b3b48] disabled:opacity-50 transition"
            >
              {salvando ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar Árvore
            </button>
          )}
        </div>
      </div>

      {/* Alertas */}
      {mensagemSucesso && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1 font-medium">{mensagemSucesso}</div>
          <button onClick={() => setMensagemSucesso(null)} className="font-bold">&times;</button>
        </div>
      )}
      {mensagemErro && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
          <AlertCircle className="size-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1 font-medium">{mensagemErro}</div>
          <button onClick={() => setMensagemErro(null)} className="font-bold">&times;</button>
        </div>
      )}

      {/* Navegação por Abas */}
      <div className="flex items-center border-b border-gray-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveViewTab('canvas')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
            activeViewTab === 'canvas'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Layers className="size-4" />
          Canvas Visual de Automação
        </button>

        <button
          type="button"
          onClick={() => setActiveViewTab('logs')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
            activeViewTab === 'logs'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Clock className="size-4" />
          Auditoria de Execuções ({logs.length})
        </button>
      </div>

      {activeViewTab === 'canvas' && (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr] items-start">
          {/* Sidebar: Lista de Árvores */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-700 uppercase">Árvores Cadastradas ({arvores.length})</span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-3.5 text-gray-400" />
              <input
                type="text"
                value={buscaArvore}
                onChange={(e) => setBuscaArvore(e.target.value)}
                placeholder="Filtrar por nome ou gatilho..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
              {arvoresFiltradas.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">Nenhuma árvore localizada.</div>
              ) : (
                arvoresFiltradas.map((tree) => {
                  const isSelected = tree.id === arvoreAtivaId;
                  return (
                    <div
                      key={tree.id}
                      onClick={() => setArvoreAtivaId(tree.id)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-primary/5 border-primary text-primary shadow-xs'
                          : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-xs truncate text-gray-900">{tree.nome}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExcluirArvore(tree.id);
                          }}
                          className="text-gray-400 hover:text-red-600 p-0.5 rounded transition"
                          title="Excluir Árvore"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                        <span className="text-primary font-semibold truncate max-w-[130px]">{tree.gatilhoCodigo}</span>
                        <span>{tree.nos.length} nó(s)</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Canvas Interativo em Tema Claro */}
          {arvoreAtiva ? (
            <div
              className="relative bg-[#f8fafc] border border-gray-200 rounded-2xl shadow-xs overflow-hidden select-none"
              style={{ height: '660px' }}
            >
              {/* Header Flutuante do Canvas */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-white/95 backdrop-blur-xs border border-gray-200 rounded-xl px-4 py-2 shadow-sm text-xs">
                <div className="flex items-center gap-2 border-r border-gray-200 pr-3">
                  <span className="font-mono text-primary font-bold">{arvoreAtiva.gatilhoCodigo}</span>
                  <span className="font-bold text-gray-900 truncate max-w-[200px]">{arvoreAtiva.nome}</span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Ativa
                </span>
              </div>

              {/* Controles de Zoom e Auto-Layout */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-gray-200 rounded-xl p-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={resetLayoutAuto}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:text-primary font-semibold rounded hover:bg-gray-100 transition"
                  title="Auto-organizar layout em hierarquia"
                >
                  <RefreshCw className="size-3 text-primary" />
                  Auto-Layout
                </button>
                <div className="h-4 w-px bg-gray-200 mx-1" />
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                  className="p-1.5 text-gray-600 hover:text-primary hover:bg-gray-100 rounded"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="size-4" />
                </button>
                <span className="text-xs font-mono font-bold text-primary px-1">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
                  className="p-1.5 text-gray-600 hover:text-primary hover:bg-gray-100 rounded"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="p-1.5 text-gray-600 hover:text-primary hover:bg-gray-100 rounded"
                  title="Centralizar 100%"
                >
                  <Maximize2 className="size-4" />
                </button>
              </div>

              {/* Área do Canvas com Grade Magnética */}
              <div
                ref={canvasRef}
                onMouseDown={handleMouseDownCanvas}
                onMouseMove={handleMouseMoveCanvas}
                onMouseUp={handleMouseUpCanvas}
                className={`canvas-area w-full h-full overflow-hidden ${
                  draggingNodeId ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                style={{
                  backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                  backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
                  backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                }}
              >
                {/* Contêiner Escalável com Transform Zoom/Pan */}
                <div
                  className="relative origin-top-left pointer-events-none"
                  style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                    width: '2400px',
                    height: '1800px',
                  }}
                >
                  {/* SVG de Conexões em Curvas de Bézier */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <defs>
                      <linearGradient id="lineGradDuo" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#0e4a5a" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#00d4e0" stopOpacity="0.9" />
                      </linearGradient>
                    </defs>

                    {conexoes.map((c, i) => {
                      const deltaY = (c.to.y - c.from.y) / 2;
                      const pathD = `M ${c.from.x} ${c.from.y} C ${c.from.x} ${c.from.y + deltaY}, ${c.to.x} ${c.to.y - deltaY}, ${c.to.x} ${c.to.y}`;
                      return (
                        <g key={i}>
                          <path
                            d={pathD}
                            fill="none"
                            stroke="url(#lineGradDuo)"
                            strokeWidth="2.5"
                            strokeDasharray="5 3"
                          />
                          <circle cx={c.to.x} cy={c.to.y} r="4" fill="#00d4e0" />
                        </g>
                      );
                    })}

                    {/* Linha Guia de Alinhamento Magnético */}
                    {snapGuias?.x !== undefined && (
                      <line
                        x1={snapGuias.x}
                        y1={0}
                        x2={snapGuias.x}
                        y2={1800}
                        stroke="#00d4e0"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                    )}
                  </svg>

                  {/* Renderização dos Nós Arrastáveis */}
                  {nosAtuais.map((no) => {
                    const pos = posicoes.get(no.id) || { x: 520, y: 60 };

                    return (
                      <div
                        key={no.id}
                        style={{
                          position: 'absolute',
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          width: '280px',
                        }}
                        className="pointer-events-auto z-10"
                      >
                        <div
                          className={`group relative flex flex-col rounded-2xl bg-white border p-3.5 shadow-md transition-all ${
                            draggingNodeId === no.id
                              ? 'ring-2 ring-primary scale-105 shadow-xl z-40'
                              : 'hover:shadow-lg hover:border-primary/50'
                          } ${
                            no.tipo === 'GATILHO'
                              ? 'border-primary/40 bg-gradient-to-b from-primary/5 to-white'
                              : no.tipo === 'CONDICAO_SE'
                              ? 'border-amber-300 bg-gradient-to-b from-amber-50/40 to-white'
                              : no.tipo.startsWith('LOGICO_')
                              ? 'border-indigo-300 bg-gradient-to-b from-indigo-50/40 to-white'
                              : 'border-emerald-300 bg-gradient-to-b from-emerald-50/40 to-white'
                          }`}
                        >
                          {/* Barra de Arraste Superior */}
                          <div
                            onMouseDown={(e) => handleMouseDownNode(e, no, pos)}
                            className="flex items-center justify-between pb-2 border-b border-gray-100 cursor-grab active:cursor-grabbing hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 transition"
                            title="Clique e arraste para reposicionar este galho"
                          >
                            <div className="flex items-center gap-1.5">
                              <GripVertical className="size-3.5 text-gray-400" />
                              {no.tipo === 'GATILHO' && <Zap className="size-3.5 text-primary" />}
                              {no.tipo === 'CONDICAO_SE' && <Sliders className="size-3.5 text-amber-600" />}
                              {no.tipo === 'LOGICO_E' && <GitBranch className="size-3.5 text-indigo-600" />}
                              {no.tipo === 'LOGICO_OU' && <GitFork className="size-3.5 text-purple-600" />}
                              {no.tipo === 'ACAO_EMAIL' && <Mail className="size-3.5 text-emerald-600" />}
                              {no.tipo === 'ACAO_STATUS' && <UserCheck className="size-3.5 text-emerald-600" />}
                              {no.tipo === 'ACAO_WEBHOOK' && <Globe className="size-3.5 text-emerald-600" />}

                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                                {no.tipo === 'GATILHO'
                                  ? 'Nó Raiz (Evento)'
                                  : no.tipo === 'CONDICAO_SE'
                                  ? 'Filtro Condicional'
                                  : no.tipo === 'LOGICO_E'
                                  ? "Operador 'E'"
                                  : no.tipo === 'LOGICO_OU'
                                  ? "Operador 'OU'"
                                  : 'Ação'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setNoEmEdicao(no)}
                                className="p-1 text-gray-400 hover:text-primary rounded transition"
                                title="Editar Configuração do Nó"
                              >
                                <Edit3 className="size-3" />
                              </button>
                              {no.tipo !== 'GATILHO' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoverNo(no.id)}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded transition"
                                  title="Remover Nó"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Conteúdo Informativo do Nó */}
                          <div className="py-2 flex flex-col gap-1">
                            <h5 className="text-xs font-bold text-gray-900 truncate">{no.titulo}</h5>
                            {no.subtitulo && <p className="text-[11px] text-gray-500 line-clamp-1">{no.subtitulo}</p>}

                            {no.tipo === 'CONDICAO_SE' && no.configuracao?.campo && (
                              <div className="mt-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] font-mono text-amber-800">
                                IF: {no.configuracao.campo} {no.configuracao.operador || '=='} "{no.configuracao.valor_comparacao}"
                              </div>
                            )}

                            {no.tipo === 'ACAO_EMAIL' && no.configuracao?.template_id && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-md">
                                <Mail className="size-3 shrink-0" />
                                <span className="truncate">Tpl: {no.configuracao.template_id}</span>
                              </div>
                            )}
                          </div>

                          {/* Botão de Ramificação */}
                          <div className="pt-2 border-t border-gray-100 flex justify-center">
                            <button
                              type="button"
                              onClick={() => setModalAdicionarPaiId(no.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white px-2.5 py-0.5 text-[10px] font-bold transition shadow-2xs"
                            >
                              <Plus className="size-3" />
                              Ramificar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-16 bg-white border border-dashed border-gray-300 rounded-2xl text-center">
              <FolderKanban className="size-12 text-gray-300 mb-3" />
              <p className="font-bold text-gray-800">Nenhuma Árvore Selecionada</p>
              <button
                type="button"
                onClick={() => setModalNovaArvore(true)}
                className="mt-3 text-xs font-bold text-primary hover:underline"
              >
                Criar Nova Árvore de Decisão
              </button>
            </div>
          )}
        </div>
      )}

      {/* Aba 2: Auditoria de Logs */}
      {activeViewTab === 'logs' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
            <h3 className="font-bold text-sm text-gray-900">Histórico de Disparos e Avaliação de Árvores</h3>
            <button
              type="button"
              onClick={carregarDados}
              className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
            >
              <RefreshCw className="size-3" />
              Atualizar
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              Nenhuma execução de automação registrada recentemente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Evento Disparador</th>
                    <th className="p-3.5">Contexto ID</th>
                    <th className="p-3.5">Ações Executadas</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition">
                      <td className="p-3.5 whitespace-nowrap text-gray-500 font-mono">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3.5 font-bold font-mono text-primary">
                        {log.event_type}
                      </td>
                      <td className="p-3.5 font-mono text-gray-600">
                        {log.context_id || '—'}
                      </td>
                      <td className="p-3.5">
                        <span className="font-semibold text-gray-900">{log.actions_executed?.length || 0} ação(ões)</span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            log.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : log.status === 'no_action'
                              ? 'bg-gray-100 text-gray-600'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {log.status === 'success' ? 'Sucesso' : log.status === 'no_action' ? 'Critérios Não Atendidos' : 'Parcial/Erro'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Criar Nova Árvore */}
      {modalNovaArvore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900">Criar Nova Árvore de Decisão</h3>
              <button onClick={() => setModalNovaArvore(false)} className="text-gray-400 hover:text-gray-900">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase">Nome da Automação *</label>
                <input
                  type="text"
                  value={nomeNovaArvore}
                  onChange={(e) => setNomeNovaArvore(e.target.value)}
                  placeholder="Ex: Pós-Venda Seguro RC"
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase">Evento Gatilho Raiz *</label>
                <select
                  value={eventoNovo}
                  onChange={(e) => setEventoNovo(e.target.value)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none bg-white"
                >
                  {eventosDisponiveis.map((ev) => (
                    <option key={ev.codigo} value={ev.codigo}>
                      {ev.nome} ({ev.codigo})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setModalNovaArvore(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCriarNovaArvore}
                className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-[#0b3b48] rounded-xl shadow-xs"
              >
                Criar Árvore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Ramificação */}
      {modalAdicionarPaiId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900">Adicionar Ramificação</h3>
              <button onClick={() => setModalAdicionarPaiId(null)} className="text-gray-400 hover:text-gray-900">
                <X className="size-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500">Selecione o tipo de nó a ser adicionado como descendente deste fluxo:</p>

            <div className="grid gap-2.5">
              <button
                type="button"
                onClick={() => handleAdicionarNo(modalAdicionarPaiId, 'CONDICAO_SE')}
                className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-left transition"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500 text-white shrink-0">
                  <Sliders className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Filtro Condicional 'SE' (IF)</h4>
                  <p className="text-[11px] text-gray-600">Compara campos como prêmio final, plano ou status.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleAdicionarNo(modalAdicionarPaiId, 'LOGICO_E')}
                className="flex items-center gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/70 text-left transition"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-500 text-white shrink-0">
                  <GitBranch className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Operador Lógico 'E' (AND)</h4>
                  <p className="text-[11px] text-gray-600">Exige que todas as sub-condições sejam atendidas.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleAdicionarNo(modalAdicionarPaiId, 'LOGICO_OU')}
                className="flex items-center gap-3 p-3 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100/70 text-left transition"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500 text-white shrink-0">
                  <GitFork className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Operador Lógico 'OU' (OR)</h4>
                  <p className="text-[11px] text-gray-600">Dispara se qualquer uma das condições for satisfeita.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleAdicionarNo(modalAdicionarPaiId, 'ACAO_EMAIL')}
                className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-left transition"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                  <Mail className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900">Ação: Enviar E-mail</h4>
                  <p className="text-[11px] text-gray-600">Dispara um modelo de e-mail cadastrado via SMTP.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurar Nó */}
      {noEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900">Configurar Nó — {noEmEdicao.titulo}</h3>
              <button onClick={() => setNoEmEdicao(null)} className="text-gray-400 hover:text-gray-900">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-gray-700 uppercase">Título Exibido no Nó</label>
                <input
                  type="text"
                  value={noEmEdicao.titulo}
                  onChange={(e) => setNoEmEdicao({ ...noEmEdicao, titulo: e.target.value })}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-primary focus:outline-none"
                />
              </div>

              {noEmEdicao.tipo === 'CONDICAO_SE' && (
                <div className="flex flex-col gap-3 p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
                  <span className="font-bold text-amber-800 uppercase">Regra Condicional:</span>

                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 font-semibold">Campo do Contexto</label>
                    <select
                      value={noEmEdicao.configuracao?.campo || 'cotacao.premio_final'}
                      onChange={(e) =>
                        setNoEmEdicao({
                          ...noEmEdicao,
                          configuracao: { ...noEmEdicao.configuracao, campo: e.target.value },
                        })
                      }
                      className="rounded-lg border border-gray-300 p-2 bg-white"
                    >
                      <option value="cotacao.premio_final">Prêmio Final da Cotação (R$)</option>
                      <option value="cotacao.cobertura">Importância Segurada / Cobertura (R$)</option>
                      <option value="cotacao.status">Status da Cotação</option>
                      <option value="parceiro.codigoVenda">Código de Indicação do Parceiro (wixCode)</option>
                      <option value="transacao.forma_pagamento">Forma de Pagamento (PIX, CREDIT_CARD, BOLETO)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-gray-700 font-semibold">Operador</label>
                      <select
                        value={noEmEdicao.configuracao?.operador || 'IGUAL'}
                        onChange={(e) =>
                          setNoEmEdicao({
                            ...noEmEdicao,
                            configuracao: { ...noEmEdicao.configuracao, operador: e.target.value as any },
                          })
                        }
                        className="rounded-lg border border-gray-300 p-2 bg-white"
                      >
                        <option value="IGUAL">Igual a (==)</option>
                        <option value="DIFERENTE">Diferente de (!=)</option>
                        <option value="MAIOR">Maior que (&gt;)</option>
                        <option value="MENOR">Menor que (&lt;)</option>
                        <option value="CONTEM">Contém texto</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-gray-700 font-semibold">Valor Esperado</label>
                      <input
                        type="text"
                        value={noEmEdicao.configuracao?.valor_comparacao || ''}
                        onChange={(e) =>
                          setNoEmEdicao({
                            ...noEmEdicao,
                            configuracao: { ...noEmEdicao.configuracao, valor_comparacao: e.target.value },
                          })
                        }
                        placeholder="Ex: 500 ou PIX"
                        className="rounded-lg border border-gray-300 p-2 bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {noEmEdicao.tipo === 'ACAO_EMAIL' && (
                <div className="flex flex-col gap-3 p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
                  <span className="font-bold text-emerald-800 uppercase">Configuração do E-mail:</span>

                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 font-semibold">Modelo de E-mail (Template)</label>
                    <select
                      value={noEmEdicao.configuracao?.template_id || ''}
                      onChange={(e) =>
                        setNoEmEdicao({
                          ...noEmEdicao,
                          configuracao: { ...noEmEdicao.configuracao, template_id: e.target.value },
                        })
                      }
                      className="rounded-lg border border-gray-300 p-2 bg-white"
                    >
                      {templatesDisponiveis.map((t) => (
                        <option key={t.id} value={t.code}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-gray-700 font-semibold">Destinatário Principal</label>
                    <select
                      value={noEmEdicao.configuracao?.destinatario_tipo || 'CLIENTE'}
                      onChange={(e) =>
                        setNoEmEdicao({
                          ...noEmEdicao,
                          configuracao: {
                            ...noEmEdicao.configuracao,
                            destinatario_tipo: e.target.value,
                          },
                        })
                      }
                      className="rounded-lg border border-gray-300 p-2 bg-white"
                    >
                      <option value="CLIENTE">Cliente Segurado (E-mail cadastrado)</option>
                      <option value="PARCEIRO">Corretora Parceira (E-mail do parceiro)</option>
                      <option value="ADMIN">Operação DuoLife (E-mail interno)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setNoEmEdicao(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSalvarEdicaoNo(noEmEdicao)}
                className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-[#0b3b48] rounded-xl shadow-xs"
              >
                Aplicar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
