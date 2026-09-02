import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Monitor,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Layout,
  Type,
  MousePointerClick,
  Image as ImageIcon,
  Minus,
  Maximize2,
  Table as TableIcon,
  Code,
  Sparkles,
  RotateCcw,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ExternalLink,
  Layers,
  Settings,
  HelpCircle,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Highlighter,
  RemoveFormatting
} from 'lucide-react';
import {
  EmailDesign,
  EmailSection,
  EmailColumn,
  EmailBlock,
  BlockType,
  SectionType,
  BlockContent,
  TextBlockContent,
  ButtonBlockContent,
  ImageBlockContent,
  DividerBlockContent,
  SpacerBlockContent,
  TableBlockContent,
  HtmlBlockContent
} from './types';
import { generateEmailHtml } from './emailHtmlGenerator';
import { createBlankDesign, STARTER_TEMPLATES } from './defaultTemplates';
import styles from './EmailVisualEditor.module.css';

interface RichTextEditorProps {
  initialHtml: string;
  onChange: (newHtml: string) => void;
  defaultColor?: string;
  defaultFontFamily?: string;
}

function RichTextEditorControl({ initialHtml, onChange, defaultColor = '#334155', defaultFontFamily }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isCodeMode, setIsCodeMode] = useState(false);
  const [htmlCode, setHtmlCode] = useState(initialHtml);
  const [textColor, setTextColor] = useState(defaultColor);
  const [highlightColor, setHighlightColor] = useState('#fef08a');

  useEffect(() => {
    if (editorRef.current && !isCodeMode) {
      if (editorRef.current.innerHTML !== initialHtml) {
        editorRef.current.innerHTML = initialHtml;
      }
    }
    setHtmlCode(initialHtml);
  }, [initialHtml, isCodeMode]);

  const exec = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setHtmlCode(html);
      onChange(html);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setHtmlCode(html);
      onChange(html);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setHtmlCode(val);
    onChange(val);
  };

  const handleLink = () => {
    const url = prompt('Digite a URL do link:', 'https://');
    if (url) {
      exec('createLink', url);
    }
  };

  return (
    <div className={styles.richEditorWrapper}>
      <div className={styles.richToolbar}>
        {/* Alternar Visual / HTML */}
        <div className={styles.richToolGroup}>
          <button
            type="button"
            className={`${styles.richToolBtn} ${isCodeMode ? styles.active : ''}`}
            onClick={() => setIsCodeMode(!isCodeMode)}
            title={isCodeMode ? 'Ver Editor Visual' : 'Ver Código HTML'}
          >
            <Code size={14} />
          </button>
        </div>

        {!isCodeMode && (
          <>
            {/* Fonte e Tamanho */}
            <div className={styles.richToolGroup}>
              <select
                className={styles.richSelect}
                onChange={(e) => exec('fontName', e.target.value)}
                defaultValue=""
                title="Família da Fonte"
              >
                <option value="" disabled>Fonte</option>
                <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif">Segoe UI</option>
                <option value="Arial, Helvetica, sans-serif">Arial</option>
                <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', Times, serif">Times New Roman</option>
                <option value="Verdana, Geneva, sans-serif">Verdana</option>
                <option value="'Trebuchet MS', Helvetica, sans-serif">Trebuchet MS</option>
                <option value="'Courier New', Courier, monospace">Courier New</option>
              </select>

              <select
                className={styles.richSelect}
                onChange={(e) => exec('fontSize', e.target.value)}
                defaultValue=""
                title="Tamanho do Texto"
              >
                <option value="" disabled>Tamanho</option>
                <option value="1">10px (Muito Pequeno)</option>
                <option value="2">12px (Pequeno)</option>
                <option value="3">15px (Normal)</option>
                <option value="4">18px (Médio)</option>
                <option value="5">24px (Grande)</option>
                <option value="6">32px (Título)</option>
              </select>
            </div>

            {/* Negrito, Itálico, Sublinhado, Tachado */}
            <div className={styles.richToolGroup}>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('bold')}
                title="Negrito (Ctrl+B)"
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('italic')}
                title="Itálico (Ctrl+I)"
              >
                <Italic size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('underline')}
                title="Sublinhado (Ctrl+U)"
              >
                <Underline size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('strikeThrough')}
                title="Tachado"
              >
                <Strikethrough size={13} />
              </button>
            </div>

            {/* Cor e Fundo */}
            <div className={styles.richToolGroup}>
              <div className={styles.richColorBtn} title="Cor da Fonte">
                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>A</span>
                <span className={styles.richColorBar} style={{ backgroundColor: textColor }} />
                <input
                  type="color"
                  className={styles.richColorInput}
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value);
                    exec('foreColor', e.target.value);
                  }}
                />
              </div>

              <div className={styles.richColorBtn} title="Cor de Realce / Fundo">
                <Highlighter size={13} />
                <span className={styles.richColorBar} style={{ backgroundColor: highlightColor }} />
                <input
                  type="color"
                  className={styles.richColorInput}
                  value={highlightColor}
                  onChange={(e) => {
                    setHighlightColor(e.target.value);
                    exec('hiliteColor', e.target.value);
                  }}
                />
              </div>
            </div>

            {/* Alinhamento */}
            <div className={styles.richToolGroup}>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('justifyLeft')}
                title="Alinhar à Esquerda"
              >
                <AlignLeft size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('justifyCenter')}
                title="Centralizar"
              >
                <AlignCenter size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('justifyRight')}
                title="Alinhar à Direita"
              >
                <AlignRight size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('justifyFull')}
                title="Justificar"
              >
                <AlignJustify size={13} />
              </button>
            </div>

            {/* Listas e Links */}
            <div className={styles.richToolGroup} style={{ borderRight: 'none', paddingRight: 0, marginRight: 0 }}>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('insertUnorderedList')}
                title="Lista com Marcadores"
              >
                <List size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('insertOrderedList')}
                title="Lista Numerada"
              >
                <ListOrdered size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={handleLink}
                title="Inserir Link"
              >
                <LinkIcon size={13} />
              </button>
              <button
                type="button"
                className={styles.richToolBtn}
                onClick={() => exec('removeFormat')}
                title="Limpar Formatação"
              >
                <RemoveFormatting size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Editor Content Area */}
      {isCodeMode ? (
        <textarea
          className={styles.formTextarea}
          style={{ border: 'none', borderRadius: 0, minHeight: 120 }}
          value={htmlCode}
          onChange={handleCodeChange}
          placeholder="Código HTML do bloco..."
        />
      ) : (
        <div
          ref={editorRef}
          className={styles.richContentArea}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          style={{ fontFamily: defaultFontFamily }}
        />
      )}
    </div>
  );
}

export interface EmailVisualEditorProps {
  initialDesignJson?: string | null;
  initialHtml?: string;
  onChange: (html: string, designJson: string) => void;
  availableVariables?: string[];
}

export function EmailVisualEditor({
  initialDesignJson,
  initialHtml,
  onChange,
  availableVariables = [
    'nome',
    'email',
    'telefone',
    'cotacao_id',
    'produto_nome',
    'valor',
    'cobertura',
    'parceiro_nome',
    'codigo_venda',
    'link_proposta',
    'link_fatura',
    'link_reset',
    'tempo_expiracao',
    '-data-',
    '-hora-',
    '-ano-',
  ]
}: EmailVisualEditorProps) {
  // Estado do Design
  const [design, setDesign] = useState<EmailDesign>(() => {
    if (initialDesignJson) {
      try {
        const parsed = JSON.parse(initialDesignJson);
        if (parsed && parsed.sections) {
          return parsed;
        }
      } catch (e) {
        console.warn('Erro ao parsear initialDesignJson:', e);
      }
    }
    return createBlankDesign();
  });

  // Histórico para Desfazer (Undo)
  const [history, setHistory] = useState<EmailDesign[]>([]);
  const isInternalUpdate = useRef(false);

  // Elemento / Seção selecionada
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Modo de Visualização (Desktop vs Mobile)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Aba da barra lateral esquerda ('sections' ou 'blocks')
  const [leftTab, setLeftTab] = useState<'sections' | 'blocks'>('sections');

  // Modal de Modelos Prontos
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  // Atualização e emissão do HTML
  const updateDesign = (newDesign: EmailDesign, recordHistory = true) => {
    if (recordHistory) {
      setHistory((prev) => [...prev.slice(-20), design]);
    }
    setDesign(newDesign);
    const html = generateEmailHtml(newDesign);
    const jsonStr = JSON.stringify(newDesign);
    onChange(html, jsonStr);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setDesign(previous);
    const html = generateEmailHtml(previous);
    onChange(html, JSON.stringify(previous));
  };

  // Inicializar emissão no primeiro render
  useEffect(() => {
    const html = generateEmailHtml(design);
    onChange(html, JSON.stringify(design));
  }, []);

  // --- SELEÇÃO ---
  const handleSelectSection = (e: React.MouseEvent, secId: string) => {
    e.stopPropagation();
    setSelectedSectionId(secId);
    setSelectedBlockId(null);
  };

  const handleSelectBlock = (e: React.MouseEvent, secId: string, blkId: string) => {
    e.stopPropagation();
    setSelectedSectionId(secId);
    setSelectedBlockId(blkId);
  };

  const handleClearSelection = () => {
    setSelectedSectionId(null);
    setSelectedBlockId(null);
  };

  // --- MANIPULAÇÃO DE SEÇÕES ---
  const addSection = (type: SectionType) => {
    const newSectionId = 'sec_' + Math.random().toString(36).substr(2, 9);
    let columns: EmailColumn[] = [];

    switch (type) {
      case '1-col':
      case 'header':
      case 'footer':
        columns = [
          {
            id: 'col_' + Math.random().toString(36).substr(2, 9),
            widthPercent: 100,
            blocks: [
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'text',
                content: {
                  type: 'text',
                  data: {
                    html: type === 'header'
                      ? '<h2 style="margin:0; text-align:center; color:#1e293b;">Novo Cabeçalho</h2>'
                      : type === 'footer'
                      ? '<p style="margin:0; text-align:center; font-size:12px; color:#94a3b8;">Texto do rodapé e links de contato.</p>'
                      : '<p style="margin:0; color:#334155; font-size:15px;">Novo bloco de texto em 1 coluna.</p>',
                    align: type === 'header' || type === 'footer' ? 'center' : 'left',
                  },
                },
              },
            ],
          },
        ];
        break;

      case '2-col':
        columns = [
          {
            id: 'col_' + Math.random().toString(36).substr(2, 9),
            widthPercent: 50,
            blocks: [
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'text',
                content: {
                  type: 'text',
                  data: { html: '<h4 style="margin:0 0 6px 0; color:#2563eb;">Coluna 1</h4><p style="margin:0; font-size:13px; color:#64748b;">Conteúdo da esquerda.</p>', align: 'left' },
                },
              },
            ],
          },
          {
            id: 'col_' + Math.random().toString(36).substr(2, 9),
            widthPercent: 50,
            blocks: [
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'text',
                content: {
                  type: 'text',
                  data: { html: '<h4 style="margin:0 0 6px 0; color:#2563eb;">Coluna 2</h4><p style="margin:0; font-size:13px; color:#64748b;">Conteúdo da direita.</p>', align: 'left' },
                },
              },
            ],
          },
        ];
        break;

      case '2-col-left-wide':
        columns = [
          {
            id: 'col_' + Math.random().toString(36).substr(2, 9),
            widthPercent: 70,
            blocks: [
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'text',
                content: {
                  type: 'text',
                  data: { html: '<h4 style="margin:0; color:#1e293b;">Coluna Larga (70%)</h4><p style="margin:6px 0 0 0; font-size:14px; color:#475569;">Área de destaque com maior espaço.</p>', align: 'left' },
                },
              },
            ],
          },
          {
            id: 'col_' + Math.random().toString(36).substr(2, 9),
            widthPercent: 30,
            blocks: [
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'button',
                content: {
                  type: 'button',
                  data: { text: 'Botão', url: '#', buttonColor: '#2563eb', textColor: '#ffffff', align: 'center', borderRadius: 6, fontSize: 14, paddingX: 16, paddingY: 10 },
                },
              },
            ],
          },
        ];
        break;

      case '3-col':
        columns = [1, 2, 3].map((num) => ({
          id: 'col_' + Math.random().toString(36).substr(2, 9),
          widthPercent: 33.33,
          blocks: [
            {
              id: 'blk_' + Math.random().toString(36).substr(2, 9),
              type: 'text',
              content: {
                type: 'text',
                data: { html: `<h4 style="margin:0 0 4px 0; color:#2563eb;">Item ${num}</h4><p style="margin:0; font-size:12px; color:#64748b;">Descrição do item.</p>`, align: 'center' },
              },
            },
          ],
        }));
        break;

      case 'card':
        columns = [
          {
            id: 'col_' + Math.random().toString(36).substr(2, 9),
            widthPercent: 100,
            blocks: [
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'text',
                content: {
                  type: 'text',
                  data: { html: '<h3 style="margin-top:0; color:#1e293b;">🌟 Cartão de Destaque</h3><p style="color:#475569; font-size:14px;">Utilize este card para destacar anúncios, promoções ou notificações importantes.</p>', align: 'center' },
                },
              },
              {
                id: 'blk_' + Math.random().toString(36).substr(2, 9),
                type: 'button',
                content: {
                  type: 'button',
                  data: { text: 'Conferir Detalhes', url: '#', buttonColor: '#2563eb', textColor: '#ffffff', align: 'center', borderRadius: 6, fontSize: 15, paddingX: 20, paddingY: 10 },
                },
              },
            ],
          },
        ];
        break;
    }

    const newSection: EmailSection = {
      id: newSectionId,
      type,
      styles: {
        backgroundColor: type === 'card' ? '#f8fafc' : '#ffffff',
        paddingTop: type === 'header' ? 24 : 16,
        paddingBottom: type === 'footer' ? 24 : 16,
        paddingLeft: 20,
        paddingRight: 20,
        borderRadius: type === 'card' ? 8 : 0,
        borderWidth: type === 'card' ? 1 : 0,
        borderColor: '#e2e8f0',
        borderStyle: 'solid',
      },
      columns,
    };

    updateDesign({
      ...design,
      sections: [...design.sections, newSection],
    });
    setSelectedSectionId(newSectionId);
    setSelectedBlockId(null);
  };

  const removeSection = (secId: string) => {
    updateDesign({
      ...design,
      sections: design.sections.filter((s) => s.id !== secId),
    });
    if (selectedSectionId === secId) {
      setSelectedSectionId(null);
      setSelectedBlockId(null);
    }
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= design.sections.length) return;
    const newSections = [...design.sections];
    const [moved] = newSections.splice(index, 1);
    newSections.splice(targetIdx, 0, moved);
    updateDesign({ ...design, sections: newSections });
  };

  const duplicateSection = (secId: string) => {
    const sec = design.sections.find((s) => s.id === secId);
    if (!sec) return;
    const cloned: EmailSection = JSON.parse(JSON.stringify(sec));
    cloned.id = 'sec_' + Math.random().toString(36).substr(2, 9);
    cloned.columns.forEach((col) => {
      col.id = 'col_' + Math.random().toString(36).substr(2, 9);
      col.blocks.forEach((b) => {
        b.id = 'blk_' + Math.random().toString(36).substr(2, 9);
      });
    });

    const index = design.sections.findIndex((s) => s.id === secId);
    const newSections = [...design.sections];
    newSections.splice(index + 1, 0, cloned);
    updateDesign({ ...design, sections: newSections });
    setSelectedSectionId(cloned.id);
  };

  // --- MANIPULAÇÃO DE BLOCOS ---
  const addBlockToColumn = (secId: string, colId: string, blockType: BlockType) => {
    let content: BlockContent;

    switch (blockType) {
      case 'text':
        content = {
          type: 'text',
          data: { html: '<p style="margin:0; font-size:15px; color:#334155;">Novo bloco de texto formatado.</p>', align: 'left', fontSize: 15 },
        };
        break;
      case 'button':
        content = {
          type: 'button',
          data: {
            text: 'Clique Aqui',
            url: 'https://exemplo.com.br',
            buttonColor: '#2563eb',
            textColor: '#ffffff',
            align: 'center',
            borderRadius: 6,
            fontSize: 16,
            paddingX: 24,
            paddingY: 12,
          },
        };
        break;
      case 'image':
        content = {
          type: 'image',
          data: {
            src: 'https://images.unsplash.com/photo-1579273166152-d725a4e2b755?w=600&auto=format&fit=crop&q=80',
            alt: 'Banner Ilustrativo',
            align: 'center',
            width: '100%',
            borderRadius: 6,
          },
        };
        break;
      case 'divider':
        content = {
          type: 'divider',
          data: { color: '#e2e8f0', height: 1, style: 'solid', paddingY: 12 },
        };
        break;
      case 'spacer':
        content = {
          type: 'spacer',
          data: { height: 24 },
        };
        break;
      case 'table':
        content = {
          type: 'table',
          data: {
            headers: ['Plano', 'Recursos', 'Preço'],
            rows: [
              ['Básico', 'Até 5.000 envios', 'R$ 49,90'],
              ['Profissional', 'Envios Ilimitados', 'R$ 99,90'],
            ],
            headerBg: '#f8fafc',
            headerColor: '#1e293b',
            borderColor: '#e2e8f0',
            striped: true,
          },
        };
        break;
      case 'html':
        content = {
          type: 'html',
          data: { rawHtml: '<div style="background:#fef3c7; padding:12px; border-radius:6px; color:#92400e; font-size:13px;">Bloco de código HTML personalizado.</div>' },
        };
        break;
    }

    const newBlock: EmailBlock = {
      id: 'blk_' + Math.random().toString(36).substr(2, 9),
      type: blockType,
      content,
      styles: { marginBottom: 12 },
    };

    const newSections = design.sections.map((sec) => {
      if (sec.id !== secId) return sec;
      return {
        ...sec,
        columns: sec.columns.map((col) => {
          if (col.id !== colId) return col;
          return {
            ...col,
            blocks: [...col.blocks, newBlock],
          };
        }),
      };
    });

    updateDesign({ ...design, sections: newSections });
    setSelectedSectionId(secId);
    setSelectedBlockId(newBlock.id);
  };

  const removeBlock = (secId: string, blkId: string) => {
    const newSections = design.sections.map((sec) => {
      if (sec.id !== secId) return sec;
      return {
        ...sec,
        columns: sec.columns.map((col) => ({
          ...col,
          blocks: col.blocks.filter((b) => b.id !== blkId),
        })),
      };
    });

    updateDesign({ ...design, sections: newSections });
    if (selectedBlockId === blkId) {
      setSelectedBlockId(null);
    }
  };

  const moveBlock = (secId: string, colId: string, blkIndex: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? blkIndex - 1 : blkIndex + 1;
    const newSections = design.sections.map((sec) => {
      if (sec.id !== secId) return sec;
      return {
        ...sec,
        columns: sec.columns.map((col) => {
          if (col.id !== colId) return col;
          if (targetIdx < 0 || targetIdx >= col.blocks.length) return col;
          const newBlocks = [...col.blocks];
          const [moved] = newBlocks.splice(blkIndex, 1);
          newBlocks.splice(targetIdx, 0, moved);
          return { ...col, blocks: newBlocks };
        }),
      };
    });
    updateDesign({ ...design, sections: newSections });
  };

  const duplicateBlock = (secId: string, colId: string, blkId: string) => {
    const sec = design.sections.find((s) => s.id === secId);
    if (!sec) return;
    const col = sec.columns.find((c) => c.id === colId);
    if (!col) return;
    const blk = col.blocks.find((b) => b.id === blkId);
    if (!blk) return;

    const cloned: EmailBlock = JSON.parse(JSON.stringify(blk));
    cloned.id = 'blk_' + Math.random().toString(36).substr(2, 9);

    const blkIndex = col.blocks.findIndex((b) => b.id === blkId);
    const newSections = design.sections.map((s) => {
      if (s.id !== secId) return s;
      return {
        ...s,
        columns: s.columns.map((c) => {
          if (c.id !== colId) return c;
          const newBlocks = [...c.blocks];
          newBlocks.splice(blkIndex + 1, 0, cloned);
          return { ...c, blocks: newBlocks };
        }),
      };
    });

    updateDesign({ ...design, sections: newSections });
    setSelectedBlockId(cloned.id);
  };

  // --- ATUALIZADORES DE PROPRIEDADES ---
  const updateGlobalStyles = (key: keyof EmailDesign['globalStyles'], value: any) => {
    updateDesign({
      ...design,
      globalStyles: {
        ...design.globalStyles,
        [key]: value,
      },
    });
  };

  const updateSelectedSectionStyles = (key: keyof EmailSection['styles'], value: any) => {
    if (!selectedSectionId) return;
    const newSections = design.sections.map((sec) => {
      if (sec.id !== selectedSectionId) return sec;
      return {
        ...sec,
        styles: {
          ...sec.styles,
          [key]: value,
        },
      };
    });
    updateDesign({ ...design, sections: newSections });
  };

  const updateSelectedBlockData = (key: string, value: any) => {
    if (!selectedSectionId || !selectedBlockId) return;
    const newSections = design.sections.map((sec) => {
      if (sec.id !== selectedSectionId) return sec;
      return {
        ...sec,
        columns: sec.columns.map((col) => ({
          ...col,
          blocks: col.blocks.map((blk) => {
            if (blk.id !== selectedBlockId) return blk;
            return {
              ...blk,
              content: {
                ...blk.content,
                data: {
                  ...(blk.content as any).data,
                  [key]: value,
                },
              },
            };
          }),
        })),
      };
    });
    updateDesign({ ...design, sections: newSections });
  };

  const updateSelectedBlockStyle = (key: keyof NonNullable<EmailBlock['styles']>, value: any) => {
    if (!selectedSectionId || !selectedBlockId) return;
    const newSections = design.sections.map((sec) => {
      if (sec.id !== selectedSectionId) return sec;
      return {
        ...sec,
        columns: sec.columns.map((col) => ({
          ...col,
          blocks: col.blocks.map((blk) => {
            if (blk.id !== selectedBlockId) return blk;
            return {
              ...blk,
              styles: {
                ...blk.styles,
                [key]: value,
              },
            };
          }),
        })),
      };
    });
    updateDesign({ ...design, sections: newSections });
  };

  // Localizar o bloco selecionado atual
  let currentSelectedBlock: EmailBlock | null = null;
  let currentSelectedSection: EmailSection | null = null;
  if (selectedSectionId) {
    currentSelectedSection = design.sections.find((s) => s.id === selectedSectionId) || null;
    if (selectedBlockId && currentSelectedSection) {
      for (const col of currentSelectedSection.columns) {
        const found = col.blocks.find((b) => b.id === selectedBlockId);
        if (found) {
          currentSelectedBlock = found;
          break;
        }
      }
    }
  }

  // Inserir tag de variável no bloco selecionado
  const insertVariableTag = (tag: string) => {
    if (!currentSelectedBlock) return;
    const tagFormatted = `{{${tag}}}`;

    if (currentSelectedBlock.type === 'text') {
      const currentHtml = (currentSelectedBlock.content.data as TextBlockContent).html || '';
      updateSelectedBlockData('html', currentHtml + ' ' + tagFormatted);
    } else if (currentSelectedBlock.type === 'button') {
      const currentText = (currentSelectedBlock.content.data as ButtonBlockContent).text || '';
      updateSelectedBlockData('text', currentText + ' ' + tagFormatted);
    }
  };

  // Carregar modelo pré-fabricado
  const loadStarterTemplate = (starter: () => EmailDesign) => {
    const loaded = starter();
    updateDesign(loaded);
    setSelectedSectionId(null);
    setSelectedBlockId(null);
    setShowTemplatesModal(false);
  };

  return (
    <div className={styles.editorRoot} onClick={handleClearSelection}>
      {/* 1. Barra Superior (Toolbar) */}
      <div className={styles.topToolbar} onClick={(e) => e.stopPropagation()}>
        <div className={styles.toolbarGroup}>
          <div className={styles.deviceToggle}>
            <button
              type="button"
              className={`${styles.deviceButton} ${previewDevice === 'desktop' ? styles.active : ''}`}
              onClick={() => setPreviewDevice('desktop')}
              title="Visualização Desktop"
            >
              <Monitor size={14} />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceButton} ${previewDevice === 'mobile' ? styles.active : ''}`}
              onClick={() => setPreviewDevice('mobile')}
              title="Visualização Mobile"
            >
              <Smartphone size={14} />
              <span>Mobile</span>
            </button>
          </div>

          <button
            type="button"
            className={styles.toolButton}
            onClick={handleUndo}
            disabled={history.length === 0}
            style={{ opacity: history.length === 0 ? 0.4 : 1 }}
            title="Desfazer alteração"
          >
            <RotateCcw size={14} />
            <span>Desfazer</span>
          </button>
        </div>

        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => setShowTemplatesModal(true)}
            title="Carregar modelo de e-mail pronto"
            style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}
          >
            <Sparkles size={14} />
            <span>Modelos Prontos</span>
          </button>
        </div>
      </div>

      {/* 2. Layout Principal (Sidebar Esquerda + Canvas Central + Inspector Direito) */}
      <div className={styles.mainLayout}>
        {/* SIDEBAR ESQUERDA: Estruturas e Elementos */}
        <div className={styles.leftSidebar} onClick={(e) => e.stopPropagation()}>
          <div className={styles.sidebarTabs}>
            <button
              type="button"
              className={`${styles.sidebarTab} ${leftTab === 'sections' ? styles.active : ''}`}
              onClick={() => setLeftTab('sections')}
            >
              <Layers size={14} style={{ display: 'inline', marginRight: 4 }} />
              Seções
            </button>
            <button
              type="button"
              className={`${styles.sidebarTab} ${leftTab === 'blocks' ? styles.active : ''}`}
              onClick={() => setLeftTab('blocks')}
            >
              <Plus size={14} style={{ display: 'inline', marginRight: 4 }} />
              Elementos
            </button>
          </div>

          <div className={styles.sidebarContent}>
            {leftTab === 'sections' && (
              <>
                <div className={styles.sectionGroupTitle}>Layouts & Estruturas</div>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('1-col')}>
                  <Layout size={16} />
                  <span>1 Coluna (Cheia)</span>
                </button>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('2-col')}>
                  <Layout size={16} />
                  <span>2 Colunas (50% / 50%)</span>
                </button>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('2-col-left-wide')}>
                  <Layout size={16} />
                  <span>2 Colunas (70% / 30%)</span>
                </button>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('3-col')}>
                  <Layout size={16} />
                  <span>3 Colunas (33% / 33% / 33%)</span>
                </button>

                <div className={styles.sectionGroupTitle} style={{ marginTop: 12 }}>
                  Seções Pré-Formatadas
                </div>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('header')}>
                  <Layers size={16} />
                  <span>Cabeçalho (Logo / Título)</span>
                </button>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('card')}>
                  <Layers size={16} />
                  <span>Card / Caixa de Destaque</span>
                </button>
                <button type="button" className={styles.sectionItem} onClick={() => addSection('footer')}>
                  <Layers size={16} />
                  <span>Rodapé com Opt-out</span>
                </button>
              </>
            )}

            {leftTab === 'blocks' && (
              <>
                <div className={styles.sectionGroupTitle}>Elementos Individuais</div>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px 0' }}>
                  {selectedSectionId
                    ? 'Clique para adicionar na seção selecionada:'
                    : 'Clique em uma seção no canvas para adicionar o elemento nela.'}
                </p>
                <div className={styles.blockGrid}>
                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'text');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'text');
                      }
                    }}
                  >
                    <Type size={20} color="#2563eb" />
                    <span>Texto</span>
                  </button>

                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'button');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'button');
                      }
                    }}
                  >
                    <MousePointerClick size={20} color="#2563eb" />
                    <span>Botão CTA</span>
                  </button>

                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'image');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'image');
                      }
                    }}
                  >
                    <ImageIcon size={20} color="#2563eb" />
                    <span>Imagem</span>
                  </button>

                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'divider');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'divider');
                      }
                    }}
                  >
                    <Minus size={20} color="#2563eb" />
                    <span>Divisor</span>
                  </button>

                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'spacer');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'spacer');
                      }
                    }}
                  >
                    <Maximize2 size={20} color="#2563eb" />
                    <span>Espaçador</span>
                  </button>

                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'table');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'table');
                      }
                    }}
                  >
                    <TableIcon size={20} color="#2563eb" />
                    <span>Tabela</span>
                  </button>

                  <button
                    type="button"
                    className={styles.blockItem}
                    onClick={() => {
                      if (selectedSectionId && currentSelectedSection) {
                        addBlockToColumn(selectedSectionId, currentSelectedSection.columns[0].id, 'html');
                      } else if (design.sections.length > 0) {
                        addBlockToColumn(design.sections[0].id, design.sections[0].columns[0].id, 'html');
                      }
                    }}
                  >
                    <Code size={20} color="#2563eb" />
                    <span>HTML Livre</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* CANVAS CENTRAL (Visualizador Interativo) */}
        <div className={styles.canvasArea}>
          <div
            className={`${styles.canvasContainer} ${previewDevice === 'desktop' ? styles.desktop : styles.mobile}`}
            style={{
              backgroundColor: design.globalStyles.contentBackgroundColor || '#ffffff',
              fontFamily: design.globalStyles.fontFamily,
              color: design.globalStyles.textColor,
            }}
          >
            {design.sections.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <p>Nenhuma seção adicionada ainda.</p>
                <button
                  type="button"
                  className={styles.toolButton}
                  onClick={() => addSection('1-col')}
                  style={{ margin: '10px auto', display: 'inline-flex' }}
                >
                  <Plus size={14} /> Adicionar 1ª Seção
                </button>
              </div>
            ) : (
              design.sections.map((section, secIdx) => {
                const isSecSelected = selectedSectionId === section.id && !selectedBlockId;
                const secStyles = section.styles;

                return (
                  <div
                    key={section.id}
                    className={`${styles.sectionWrapper} ${isSecSelected ? styles.selected : ''}`}
                    style={{
                      backgroundColor: secStyles.backgroundColor || 'transparent',
                      paddingTop: secStyles.paddingTop ?? 16,
                      paddingBottom: secStyles.paddingBottom ?? 16,
                      paddingLeft: secStyles.paddingLeft ?? 20,
                      paddingRight: secStyles.paddingRight ?? 20,
                      borderRadius: secStyles.useCustomCorners
                        ? `${secStyles.borderRadiusTopLeft ?? 0}px ${secStyles.borderRadiusTopRight ?? 0}px ${secStyles.borderRadiusBottomRight ?? 0}px ${secStyles.borderRadiusBottomLeft ?? 0}px`
                        : `${secStyles.borderRadius ?? 0}px`,
                      border: secStyles.borderWidth && secStyles.borderColor
                        ? `${secStyles.borderWidth}px ${secStyles.borderStyle || 'solid'} ${secStyles.borderColor}`
                        : 'none',
                    }}
                    onClick={(e) => handleSelectSection(e, section.id)}
                  >
                    {/* Ações da Seção (canto superior esquerdo) */}
                    <div className={styles.sectionActions} onClick={(e) => e.stopPropagation()}>
                      <span className={styles.sectionBadgeText}>
                        <Layers size={10} style={{ marginRight: 3 }} /> Seção
                      </span>
                      <button
                        type="button"
                        className={styles.actionIconBtn}
                        onClick={() => moveSection(secIdx, 'up')}
                        disabled={secIdx === 0}
                        title="Mover seção para cima"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionIconBtn}
                        onClick={() => moveSection(secIdx, 'down')}
                        disabled={secIdx === design.sections.length - 1}
                        title="Mover seção para baixo"
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        type="button"
                        className={styles.actionIconBtn}
                        onClick={() => duplicateSection(section.id)}
                        title="Duplicar seção"
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${styles.actionDeleteBtn}`}
                        onClick={() => removeSection(section.id)}
                        title="Excluir seção inteira"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    {/* Colunas da Seção */}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: previewDevice === 'mobile' ? 'wrap' : 'nowrap',
                        gap: 12,
                      }}
                    >
                      {section.columns.map((col) => (
                        <div
                          key={col.id}
                          style={{
                            flex: previewDevice === 'mobile' ? '1 1 100%' : `0 0 ${col.widthPercent}%`,
                            maxWidth: previewDevice === 'mobile' ? '100%' : `${col.widthPercent}%`,
                            boxSizing: 'border-box',
                            padding: col.styles?.padding ? `${col.styles.padding}px` : '4px',
                            backgroundColor: col.styles?.backgroundColor || 'transparent',
                          }}
                        >
                          {col.blocks.length === 0 ? (
                            <div
                              className={styles.emptyColumnPlaceholder}
                              onClick={(e) => {
                                e.stopPropagation();
                                addBlockToColumn(section.id, col.id, 'text');
                              }}
                            >
                              + Adicionar Elemento
                            </div>
                          ) : (
                            col.blocks.map((block, blkIdx) => {
                              const isBlkSelected = selectedBlockId === block.id;

                              return (
                                <div
                                  key={block.id}
                                  className={`${styles.blockWrapper} ${isBlkSelected ? styles.selected : ''}`}
                                  style={{
                                    marginBottom: block.styles?.marginBottom ?? 12,
                                    marginTop: block.styles?.marginTop ?? 0,
                                    backgroundColor: block.styles?.backgroundColor || 'transparent',
                                    padding: block.styles?.padding ? `${block.styles.padding}px` : '2px',
                                  }}
                                  onClick={(e) => handleSelectBlock(e, section.id, block.id)}
                                >
                                  {/* Ações do Bloco */}
                                  <div className={styles.blockActions} onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      className={styles.actionIconBtn}
                                      onClick={() => moveBlock(section.id, col.id, blkIdx, 'up')}
                                      disabled={blkIdx === 0}
                                      title="Mover elemento para cima"
                                    >
                                      <ArrowUp size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.actionIconBtn}
                                      onClick={() => moveBlock(section.id, col.id, blkIdx, 'down')}
                                      disabled={blkIdx === col.blocks.length - 1}
                                      title="Mover elemento para baixo"
                                    >
                                      <ArrowDown size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.actionIconBtn}
                                      onClick={() => duplicateBlock(section.id, col.id, block.id)}
                                      title="Duplicar elemento"
                                    >
                                      <Copy size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.actionIconBtn} ${styles.actionDeleteBtn}`}
                                      onClick={() => removeBlock(section.id, block.id)}
                                      title="Excluir elemento"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>

                                  {/* Renderização Visual do Bloco */}
                                  {renderBlockPreview(block)}
                                </div>
                              );
                            })
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SIDEBAR DIREITA: Inspector de Propriedades */}
        <div className={styles.rightSidebar} onClick={(e) => e.stopPropagation()}>
          <div className={styles.inspectorHeader}>
            <div className={styles.inspectorTitle}>
              {currentSelectedBlock ? (
                <>
                  <Settings size={15} color="#2563eb" />
                  <span>Propriedades: {getBlockTitle(currentSelectedBlock.type)}</span>
                </>
              ) : currentSelectedSection ? (
                <>
                  <Layers size={15} color="#2563eb" />
                  <span>Propriedades da Seção</span>
                </>
              ) : (
                <>
                  <Palette size={15} color="#2563eb" />
                  <span>Estilos Globais do E-mail</span>
                </>
              )}
            </div>
          </div>

          <div className={styles.inspectorContent}>
            {/* 1. SE BLOCO ESTIVER SELECIONADO */}
            {currentSelectedBlock && (
              <>
                {/* Variáveis Dinâmicas */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Inserir Variável:</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {availableVariables.map((v) => (
                      <span
                        key={v}
                        className={styles.variableTagBadge}
                        onClick={() => insertVariableTag(v)}
                        title={`Inserir {{${v}}}`}
                      >
                        {`{{${v}}}`}
                      </span>
                    ))}
                  </div>
                </div>

                {/* TEXTO (Editor Clássico Rico WYSIWYG) */}
                {currentSelectedBlock.type === 'text' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Editor de Texto Clássico</label>
                    <RichTextEditorControl
                      initialHtml={(currentSelectedBlock.content.data as TextBlockContent).html || ''}
                      onChange={(newHtml) => updateSelectedBlockData('html', newHtml)}
                      defaultColor={(currentSelectedBlock.content.data as TextBlockContent).color || design.globalStyles.textColor}
                      defaultFontFamily={design.globalStyles.fontFamily}
                    />
                  </div>
                )}

                {/* BOTÃO */}
                {currentSelectedBlock.type === 'button' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Texto do Botão</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        value={(currentSelectedBlock.content.data as ButtonBlockContent).text || ''}
                        onChange={(e) => updateSelectedBlockData('text', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Link de Destino (URL)</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        value={(currentSelectedBlock.content.data as ButtonBlockContent).url || ''}
                        onChange={(e) => updateSelectedBlockData('url', e.target.value)}
                        placeholder="https://seusite.com.br"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Cor do Botão</label>
                      <div className={styles.colorPickerRow}>
                        <input
                          type="color"
                          className={styles.colorInput}
                          value={(currentSelectedBlock.content.data as ButtonBlockContent).buttonColor || '#2563eb'}
                          onChange={(e) => updateSelectedBlockData('buttonColor', e.target.value)}
                        />
                        <input
                          type="text"
                          className={styles.formInput}
                          value={(currentSelectedBlock.content.data as ButtonBlockContent).buttonColor || '#2563eb'}
                          onChange={(e) => updateSelectedBlockData('buttonColor', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Cor do Texto do Botão</label>
                      <div className={styles.colorPickerRow}>
                        <input
                          type="color"
                          className={styles.colorInput}
                          value={(currentSelectedBlock.content.data as ButtonBlockContent).textColor || '#ffffff'}
                          onChange={(e) => updateSelectedBlockData('textColor', e.target.value)}
                        />
                        <input
                          type="text"
                          className={styles.formInput}
                          value={(currentSelectedBlock.content.data as ButtonBlockContent).textColor || '#ffffff'}
                          onChange={(e) => updateSelectedBlockData('textColor', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className={styles.formLabel} style={{ margin: 0 }}>Arredondamento das Bordas</label>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          onClick={() => updateSelectedBlockData('useCustomCorners', !(currentSelectedBlock!.content.data as ButtonBlockContent).useCustomCorners)}
                        >
                          {(currentSelectedBlock.content.data as ButtonBlockContent).useCustomCorners ? '⊞ Modo Unificado' : '◱ Cantos Específicos'}
                        </button>
                      </div>

                      {!(currentSelectedBlock.content.data as ButtonBlockContent).useCustomCorners ? (
                        <div className={styles.rangeRow}>
                          <input
                            type="range"
                            min={0}
                            max={30}
                            className={styles.rangeInput}
                            value={(currentSelectedBlock.content.data as ButtonBlockContent).borderRadius ?? 6}
                            onChange={(e) => updateSelectedBlockData('borderRadius', parseInt(e.target.value))}
                          />
                          <span className={styles.rangeVal}>{(currentSelectedBlock.content.data as ButtonBlockContent).borderRadius ?? 6}px</span>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--color-bg-alt, #f8fafc)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↖ Sup. Esquerdo</span>
                            <input
                              type="number"
                              min={0}
                              max={40}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ButtonBlockContent).borderRadiusTopLeft ?? (currentSelectedBlock.content.data as ButtonBlockContent).borderRadius ?? 6}
                              onChange={(e) => updateSelectedBlockData('borderRadiusTopLeft', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↗ Sup. Direito</span>
                            <input
                              type="number"
                              min={0}
                              max={40}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ButtonBlockContent).borderRadiusTopRight ?? (currentSelectedBlock.content.data as ButtonBlockContent).borderRadius ?? 6}
                              onChange={(e) => updateSelectedBlockData('borderRadiusTopRight', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↙ Inf. Esquerdo</span>
                            <input
                              type="number"
                              min={0}
                              max={40}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ButtonBlockContent).borderRadiusBottomLeft ?? (currentSelectedBlock.content.data as ButtonBlockContent).borderRadius ?? 6}
                              onChange={(e) => updateSelectedBlockData('borderRadiusBottomLeft', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↘ Inf. Direito</span>
                            <input
                              type="number"
                              min={0}
                              max={40}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ButtonBlockContent).borderRadiusBottomRight ?? (currentSelectedBlock.content.data as ButtonBlockContent).borderRadius ?? 6}
                              onChange={(e) => updateSelectedBlockData('borderRadiusBottomRight', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Alinhamento</label>
                      <div className={styles.segmentedControl}>
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            className={`${styles.segmentedBtn} ${(currentSelectedBlock!.content.data as ButtonBlockContent).align === align ? styles.active : ''}`}
                            onClick={() => updateSelectedBlockData('align', align)}
                          >
                            {align === 'left' && <AlignLeft size={13} />}
                            {align === 'center' && <AlignCenter size={13} />}
                            {align === 'right' && <AlignRight size={13} />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!(currentSelectedBlock.content.data as ButtonBlockContent).fullWidth}
                          onChange={(e) => updateSelectedBlockData('fullWidth', e.target.checked)}
                        />
                        <span>Largura Total (100%)</span>
                      </label>
                    </div>
                  </>
                )}

                {/* IMAGEM */}
                {currentSelectedBlock.type === 'image' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>URL da Imagem</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        value={(currentSelectedBlock.content.data as ImageBlockContent).src || ''}
                        onChange={(e) => updateSelectedBlockData('src', e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Texto Alternativo (Alt)</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        value={(currentSelectedBlock.content.data as ImageBlockContent).alt || ''}
                        onChange={(e) => updateSelectedBlockData('alt', e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Link ao Clicar (Opcional)</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        value={(currentSelectedBlock.content.data as ImageBlockContent).url || ''}
                        onChange={(e) => updateSelectedBlockData('url', e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Alinhamento</label>
                      <div className={styles.segmentedControl}>
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            className={`${styles.segmentedBtn} ${(currentSelectedBlock!.content.data as ImageBlockContent).align === align ? styles.active : ''}`}
                            onClick={() => updateSelectedBlockData('align', align)}
                          >
                            {align === 'left' && <AlignLeft size={13} />}
                            {align === 'center' && <AlignCenter size={13} />}
                            {align === 'right' && <AlignRight size={13} />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className={styles.formLabel} style={{ margin: 0 }}>Arredondamento da Imagem</label>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          onClick={() => updateSelectedBlockData('useCustomCorners', !(currentSelectedBlock!.content.data as ImageBlockContent).useCustomCorners)}
                        >
                          {(currentSelectedBlock.content.data as ImageBlockContent).useCustomCorners ? '⊞ Modo Unificado' : '◱ Cantos Específicos'}
                        </button>
                      </div>

                      {!(currentSelectedBlock.content.data as ImageBlockContent).useCustomCorners ? (
                        <div className={styles.rangeRow}>
                          <input
                            type="range"
                            min={0}
                            max={40}
                            className={styles.rangeInput}
                            value={(currentSelectedBlock.content.data as ImageBlockContent).borderRadius ?? 0}
                            onChange={(e) => updateSelectedBlockData('borderRadius', parseInt(e.target.value))}
                          />
                          <span className={styles.rangeVal}>{(currentSelectedBlock.content.data as ImageBlockContent).borderRadius ?? 0}px</span>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--color-bg-alt, #f8fafc)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↖ Sup. Esquerdo</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ImageBlockContent).borderRadiusTopLeft ?? (currentSelectedBlock.content.data as ImageBlockContent).borderRadius ?? 0}
                              onChange={(e) => updateSelectedBlockData('borderRadiusTopLeft', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↗ Sup. Direito</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ImageBlockContent).borderRadiusTopRight ?? (currentSelectedBlock.content.data as ImageBlockContent).borderRadius ?? 0}
                              onChange={(e) => updateSelectedBlockData('borderRadiusTopRight', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↙ Inf. Esquerdo</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ImageBlockContent).borderRadiusBottomLeft ?? (currentSelectedBlock.content.data as ImageBlockContent).borderRadius ?? 0}
                              onChange={(e) => updateSelectedBlockData('borderRadiusBottomLeft', parseInt(e.target.value) || 0)}
                            />
                          </div>
                          <div>
                            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↘ Inf. Direito</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              className={styles.formInput}
                              value={(currentSelectedBlock.content.data as ImageBlockContent).borderRadiusBottomRight ?? (currentSelectedBlock.content.data as ImageBlockContent).borderRadius ?? 0}
                              onChange={(e) => updateSelectedBlockData('borderRadiusBottomRight', parseInt(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* DIVISOR */}
                {currentSelectedBlock.type === 'divider' && (
                  <>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Cor da Linha</label>
                      <div className={styles.colorPickerRow}>
                        <input
                          type="color"
                          className={styles.colorInput}
                          value={(currentSelectedBlock.content.data as DividerBlockContent).color || '#e2e8f0'}
                          onChange={(e) => updateSelectedBlockData('color', e.target.value)}
                        />
                        <input
                          type="text"
                          className={styles.formInput}
                          value={(currentSelectedBlock.content.data as DividerBlockContent).color || '#e2e8f0'}
                          onChange={(e) => updateSelectedBlockData('color', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Espessura (px)</label>
                      <div className={styles.rangeRow}>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          className={styles.rangeInput}
                          value={(currentSelectedBlock.content.data as DividerBlockContent).height || 1}
                          onChange={(e) => updateSelectedBlockData('height', parseInt(e.target.value))}
                        />
                        <span className={styles.rangeVal}>{(currentSelectedBlock.content.data as DividerBlockContent).height || 1}px</span>
                      </div>
                    </div>
                  </>
                )}

                {/* ESPAÇADOR */}
                {currentSelectedBlock.type === 'spacer' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Altura do Espaço (px)</label>
                    <div className={styles.rangeRow}>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        className={styles.rangeInput}
                        value={(currentSelectedBlock.content.data as SpacerBlockContent).height || 20}
                        onChange={(e) => updateSelectedBlockData('height', parseInt(e.target.value))}
                      />
                      <span className={styles.rangeVal}>{(currentSelectedBlock.content.data as SpacerBlockContent).height || 20}px</span>
                    </div>
                  </div>
                )}

                {/* HTML LIVRE */}
                {currentSelectedBlock.type === 'html' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Código HTML</label>
                    <textarea
                      className={styles.formTextarea}
                      rows={6}
                      value={(currentSelectedBlock.content.data as HtmlBlockContent).rawHtml || ''}
                      onChange={(e) => updateSelectedBlockData('rawHtml', e.target.value)}
                    />
                  </div>
                )}

                {/* ESPAÇAMENTO & MARGENS DO BLOCO (100% Compatível com E-mails) */}
                <div style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', paddingTop: '12px', marginTop: '12px' }}>
                  <div className={styles.sectionGroupTitle} style={{ marginBottom: '8px' }}>Espaçamento & Margens do Bloco</div>
                  
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Margem Superior (px)</label>
                    <div className={styles.rangeRow}>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={2}
                        className={styles.rangeInput}
                        value={currentSelectedBlock.styles?.marginTop ?? 0}
                        onChange={(e) => updateSelectedBlockStyle('marginTop', parseInt(e.target.value))}
                      />
                      <span className={styles.rangeVal}>{currentSelectedBlock.styles?.marginTop ?? 0}px</span>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Margem Inferior (px)</label>
                    <div className={styles.rangeRow}>
                      <input
                        type="range"
                        min={0}
                        max={50}
                        step={2}
                        className={styles.rangeInput}
                        value={currentSelectedBlock.styles?.marginBottom ?? 12}
                        onChange={(e) => updateSelectedBlockStyle('marginBottom', parseInt(e.target.value))}
                      />
                      <span className={styles.rangeVal}>{currentSelectedBlock.styles?.marginBottom ?? 12}px</span>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Padding Interno (px)</label>
                    <div className={styles.rangeRow}>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={2}
                        className={styles.rangeInput}
                        value={currentSelectedBlock.styles?.padding ?? 0}
                        onChange={(e) => updateSelectedBlockStyle('padding', parseInt(e.target.value))}
                      />
                      <span className={styles.rangeVal}>{currentSelectedBlock.styles?.padding ?? 0}px</span>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Fundo do Bloco (Opcional)</label>
                    <div className={styles.colorPickerRow}>
                      <input
                        type="color"
                        className={styles.colorInput}
                        value={currentSelectedBlock.styles?.backgroundColor || '#ffffff'}
                        onChange={(e) => updateSelectedBlockStyle('backgroundColor', e.target.value)}
                      />
                      <input
                        type="text"
                        className={styles.formInput}
                        value={currentSelectedBlock.styles?.backgroundColor || ''}
                        placeholder="Ex: #f8fafc ou transparente"
                        onChange={(e) => updateSelectedBlockStyle('backgroundColor', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 2. SE SEÇÃO ESTIVER SELECIONADA */}
            {!currentSelectedBlock && currentSelectedSection && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Cor de Fundo da Seção</label>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={currentSelectedSection.styles.backgroundColor || '#ffffff'}
                      onChange={(e) => updateSelectedSectionStyles('backgroundColor', e.target.value)}
                    />
                    <input
                      type="text"
                      className={styles.formInput}
                      value={currentSelectedSection.styles.backgroundColor || '#ffffff'}
                      onChange={(e) => updateSelectedSectionStyles('backgroundColor', e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Padding Superior (px)</label>
                  <div className={styles.rangeRow}>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={2}
                      className={styles.rangeInput}
                      value={currentSelectedSection.styles.paddingTop ?? 16}
                      onChange={(e) => updateSelectedSectionStyles('paddingTop', parseInt(e.target.value))}
                    />
                    <span className={styles.rangeVal}>{currentSelectedSection.styles.paddingTop ?? 16}px</span>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Padding Inferior (px)</label>
                  <div className={styles.rangeRow}>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={2}
                      className={styles.rangeInput}
                      value={currentSelectedSection.styles.paddingBottom ?? 16}
                      onChange={(e) => updateSelectedSectionStyles('paddingBottom', parseInt(e.target.value))}
                    />
                    <span className={styles.rangeVal}>{currentSelectedSection.styles.paddingBottom ?? 16}px</span>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Padding Lateral Esquerdo (px)</label>
                  <div className={styles.rangeRow}>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={2}
                      className={styles.rangeInput}
                      value={currentSelectedSection.styles.paddingLeft ?? 20}
                      onChange={(e) => updateSelectedSectionStyles('paddingLeft', parseInt(e.target.value))}
                    />
                    <span className={styles.rangeVal}>{currentSelectedSection.styles.paddingLeft ?? 20}px</span>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Padding Lateral Direito (px)</label>
                  <div className={styles.rangeRow}>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={2}
                      className={styles.rangeInput}
                      value={currentSelectedSection.styles.paddingRight ?? 20}
                      onChange={(e) => updateSelectedSectionStyles('paddingRight', parseInt(e.target.value))}
                    />
                    <span className={styles.rangeVal}>{currentSelectedSection.styles.paddingRight ?? 20}px</span>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className={styles.formLabel} style={{ margin: 0 }}>Arredondamento das Bordas</label>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      onClick={() => updateSelectedSectionStyles('useCustomCorners', !currentSelectedSection.styles.useCustomCorners)}
                    >
                      {currentSelectedSection.styles.useCustomCorners ? '⊞ Modo Unificado' : '◱ Cantos Específicos'}
                    </button>
                  </div>

                  {!currentSelectedSection.styles.useCustomCorners ? (
                    <div className={styles.rangeRow}>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={2}
                        className={styles.rangeInput}
                        value={currentSelectedSection.styles.borderRadius ?? 0}
                        onChange={(e) => updateSelectedSectionStyles('borderRadius', parseInt(e.target.value))}
                      />
                      <span className={styles.rangeVal}>{currentSelectedSection.styles.borderRadius ?? 0}px</span>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--color-bg-alt, #f8fafc)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↖ Sup. Esquerdo</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          className={styles.formInput}
                          value={currentSelectedSection.styles.borderRadiusTopLeft ?? currentSelectedSection.styles.borderRadius ?? 0}
                          onChange={(e) => updateSelectedSectionStyles('borderRadiusTopLeft', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↗ Sup. Direito</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          className={styles.formInput}
                          value={currentSelectedSection.styles.borderRadiusTopRight ?? currentSelectedSection.styles.borderRadius ?? 0}
                          onChange={(e) => updateSelectedSectionStyles('borderRadiusTopRight', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↙ Inf. Esquerdo</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          className={styles.formInput}
                          value={currentSelectedSection.styles.borderRadiusBottomLeft ?? currentSelectedSection.styles.borderRadius ?? 0}
                          onChange={(e) => updateSelectedSectionStyles('borderRadiusBottomLeft', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>↘ Inf. Direito</span>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          className={styles.formInput}
                          value={currentSelectedSection.styles.borderRadiusBottomRight ?? currentSelectedSection.styles.borderRadius ?? 0}
                          onChange={(e) => updateSelectedSectionStyles('borderRadiusBottomRight', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 3. ESTILOS GLOBAIS SE NADA ESTIVER SELECIONADO */}
            {!currentSelectedBlock && !currentSelectedSection && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Fundo Externo (Body)</label>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={design.globalStyles.backgroundColor || '#f1f5f9'}
                      onChange={(e) => updateGlobalStyles('backgroundColor', e.target.value)}
                    />
                    <input
                      type="text"
                      className={styles.formInput}
                      value={design.globalStyles.backgroundColor || '#f1f5f9'}
                      onChange={(e) => updateGlobalStyles('backgroundColor', e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Fundo do Conteúdo Central</label>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={design.globalStyles.contentBackgroundColor || '#ffffff'}
                      onChange={(e) => updateGlobalStyles('contentBackgroundColor', e.target.value)}
                    />
                    <input
                      type="text"
                      className={styles.formInput}
                      value={design.globalStyles.contentBackgroundColor || '#ffffff'}
                      onChange={(e) => updateGlobalStyles('contentBackgroundColor', e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Largura do E-mail (px)</label>
                  <div className={styles.rangeRow}>
                    <input
                      type="range"
                      min={500}
                      max={700}
                      step={20}
                      className={styles.rangeInput}
                      value={design.globalStyles.contentWidth || 600}
                      onChange={(e) => updateGlobalStyles('contentWidth', parseInt(e.target.value))}
                    />
                    <span className={styles.rangeVal}>{design.globalStyles.contentWidth || 600}px</span>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Cor Padrão do Texto</label>
                  <div className={styles.colorPickerRow}>
                    <input
                      type="color"
                      className={styles.colorInput}
                      value={design.globalStyles.textColor || '#334155'}
                      onChange={(e) => updateGlobalStyles('textColor', e.target.value)}
                    />
                    <input
                      type="text"
                      className={styles.formInput}
                      value={design.globalStyles.textColor || '#334155'}
                      onChange={(e) => updateGlobalStyles('textColor', e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Escolha de Templates Prontos */}
      {showTemplatesModal && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowTemplatesModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              maxWidth: 520,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, color: '#0f172a' }}>Escolha um Modelo Inicial</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>
              Selecione um layout base profissional para começar rapidamente:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {STARTER_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.id}
                  style={{
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2563eb')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  onClick={() => loadStarterTemplate(tmpl.design)}
                >
                  <strong style={{ fontSize: 14, color: '#1e293b', display: 'block' }}>{tmpl.name}</strong>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{tmpl.description}</span>
                </div>
              ))}

              <div
                style={{
                  padding: 12,
                  border: '1px dashed #cbd5e1',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: 13,
                }}
                onClick={() => loadStarterTemplate(createBlankDesign)}
              >
                + Começar do Zero (Layout em Branco)
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className={styles.toolButton}
                onClick={() => setShowTemplatesModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getBlockTitle(type: BlockType): string {
  switch (type) {
    case 'text':
      return 'Texto / Parágrafo';
    case 'button':
      return 'Botão CTA';
    case 'image':
      return 'Imagem';
    case 'divider':
      return 'Divisor';
    case 'spacer':
      return 'Espaçador';
    case 'table':
      return 'Tabela';
    case 'html':
      return 'HTML Customizado';
    default:
      return 'Elemento';
  }
}

function renderBlockPreview(block: EmailBlock) {
  const { content } = block;

  switch (content.type) {
    case 'text':
      return (
        <div
          dangerouslySetInnerHTML={{ __html: content.data.html || '<p style="color:#94a3b8;">Texto vazio...</p>' }}
          style={{
            textAlign: content.data.align || 'left',
            color: content.data.color,
            fontSize: content.data.fontSize ? `${content.data.fontSize}px` : undefined,
          }}
        />
      );

    case 'button': {
      const btnRadius = content.data.useCustomCorners
        ? `${content.data.borderRadiusTopLeft ?? 0}px ${content.data.borderRadiusTopRight ?? 0}px ${content.data.borderRadiusBottomRight ?? 0}px ${content.data.borderRadiusBottomLeft ?? 0}px`
        : `${content.data.borderRadius ?? 6}px`;

      return (
        <div style={{ textAlign: content.data.align || 'center' }}>
          <span
            style={{
              display: content.data.fullWidth ? 'block' : 'inline-block',
              backgroundColor: content.data.buttonColor || '#2563eb',
              color: content.data.textColor || '#ffffff',
              padding: `${content.data.paddingY ?? 12}px ${content.data.paddingX ?? 24}px`,
              borderRadius: btnRadius,
              fontSize: `${content.data.fontSize ?? 16}px`,
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            {content.data.text || 'Clique Aqui'}
          </span>
        </div>
      );
    }

    case 'image': {
      const imgRadius = content.data.useCustomCorners
        ? `${content.data.borderRadiusTopLeft ?? 0}px ${content.data.borderRadiusTopRight ?? 0}px ${content.data.borderRadiusBottomRight ?? 0}px ${content.data.borderRadiusBottomLeft ?? 0}px`
        : `${content.data.borderRadius ?? 0}px`;

      return (
        <div style={{ textAlign: content.data.align || 'center' }}>
          <img
            src={content.data.src || 'https://via.placeholder.com/600x200?text=Imagem'}
            alt={content.data.alt || 'Imagem'}
            style={{
              maxWidth: '100%',
              width: content.data.width ? (typeof content.data.width === 'number' ? `${content.data.width}px` : content.data.width) : '100%',
              height: 'auto',
              borderRadius: imgRadius,
              display: 'inline-block',
            }}
          />
        </div>
      );
    }

    case 'divider':
      return (
        <div style={{ padding: `${content.data.paddingY ?? 10}px 0` }}>
          <div
            style={{
              borderTop: `${content.data.height || 1}px ${content.data.style || 'solid'} ${content.data.color || '#e5e7eb'}`,
              width: '100%',
            }}
          />
        </div>
      );

    case 'spacer':
      return (
        <div
          style={{
            height: `${content.data.height || 20}px`,
            backgroundColor: 'rgba(203, 213, 225, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#94a3b8',
          }}
        >
          Espaçador ({content.data.height || 20}px)
        </div>
      );

    case 'table':
      return (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: `1px solid ${content.data.borderColor || '#e2e8f0'}`,
            fontSize: 13,
          }}
        >
          <thead>
            <tr>
              {(content.data.headers || []).map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: content.data.headerBg || '#f8fafc',
                    color: content.data.headerColor || '#1e293b',
                    borderBottom: `2px solid ${content.data.borderColor || '#e2e8f0'}`,
                    textAlign: 'left',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(content.data.rows || []).map((row, rIdx) => (
              <tr key={rIdx} style={{ backgroundColor: content.data.striped && rIdx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    style={{
                      padding: '8px 10px',
                      borderBottom: `1px solid ${content.data.borderColor || '#e2e8f0'}`,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'html':
      return (
        <div
          dangerouslySetInnerHTML={{ __html: content.data.rawHtml || '<div style="color:#94a3b8;">HTML Vazio...</div>' }}
        />
      );

    default:
      return null;
  }
}
