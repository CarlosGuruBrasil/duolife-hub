'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Tag,
  SlidersHorizontal,
  MessageCircle,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { toast } from '@/components/ui/toast/toast';

export interface ProductOption {
  id: string;
  name: string;
  code?: string | null;
}

export interface GeneratedLinkData {
  id: string;
  token: string;
  url: string;
  label: string | null;
  discount_percent: number;
  expires_at: string | null;
  product_name?: string | null;
}

interface GerarLinkClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductOption[];
  defaultProductId?: string;
  onLinkCreated?: (link: GeneratedLinkData) => void;
}

export default function GerarLinkClienteModal({
  isOpen,
  onClose,
  products,
  defaultProductId,
  onLinkCreated,
}: GerarLinkClienteModalProps) {
  const [productId, setProductId] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [label, setLabel] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [generatedLink, setGeneratedLink] = useState<GeneratedLinkData | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Inicializa o produto selecionado
  useEffect(() => {
    if (defaultProductId) {
      setProductId(defaultProductId);
    } else if (products && products.length > 0) {
      setProductId(products[0].id);
    }
  }, [defaultProductId, products]);

  // Reseta estado ao abrir/fechar
  useEffect(() => {
    if (!isOpen) {
      setGeneratedLink(null);
      setCopied(false);
      setDiscountPercent(0);
      setLabel('');
      setExpiresInDays('');
    }
  }, [isOpen]);

  // Fecha com a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Trava scroll do fundo
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado para a área de transferência!');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/portal/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productId || undefined,
          discountPercent: Number(discountPercent) || 0,
          label: label.trim() || undefined,
          expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erro ao gerar link de venda');
        setLoading(false);
        return;
      }

      const selectedProduct = products.find((p) => p.id === productId);
      const linkData: GeneratedLinkData = {
        ...data.link,
        product_name: selectedProduct?.name || 'Responsabilidade Civil',
      };

      setGeneratedLink(linkData);
      toast.success('Link exclusivo gerado com sucesso!');
      if (onLinkCreated) {
        onLinkCreated(linkData);
      }
    } catch (err) {
      console.error('Erro ao gerar link:', err);
      toast.error('Erro de conexão ao gerar link.');
    } finally {
      setLoading(false);
    }
  };

  // Atalhos de clique rápido para desconto
  const discountShortcuts = [0, 5, 10, 15, 20, 25, 30, 35, 40];

  // Cálculo da comissão estimada (base 20% reduzida proporcionalmente)
  const baseCommission = 20;
  const estimatedCommission = (baseCommission * (1 - discountPercent / 100)).toFixed(1);

  // Mensagem pré-formatada para compartilhamento via WhatsApp
  const selectedProdName = products.find((p) => p.id === productId)?.name || 'Seguro de Responsabilidade Civil';
  const whatsappText = encodeURIComponent(
    `Olá! Preparei um link exclusivo para você preencher sua proposta de ${selectedProdName}${
      discountPercent > 0 ? ` com ${discountPercent}% de desconto especial aplicado` : ''
    }. Basta acessar o link e seguir os passos rápidos:\n\n${generatedLink?.url || ''}`
  );
  const whatsappUrl = `https://api.whatsapp.com/send?text=${whatsappText}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop suave */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 transition-all my-8 animate-in zoom-in-95 duration-150"
        >
          {/* Cabeçalho do Modal */}
          <div className="flex items-start justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <Link2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {generatedLink ? 'Link Exclusivo Gerado!' : 'Gerar Link para Cliente'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {generatedLink
                    ? 'Compartilhe o link abaixo para o cliente fazer seu próprio cadastro.'
                    : 'O cliente preencherá seus próprios dados com o desconto já aplicado.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo: Formulário OU Tela de Sucesso com o Link */}
          {!generatedLink ? (
            <form onSubmit={handleSubmit} className="space-y-5 pt-5">
              {/* 1. Seleção de Produto */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  1. Produto Vinculado
                </label>
                <div className="relative">
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    className="form-input text-sm w-full py-2.5 bg-white border-gray-300 focus:border-[#0e4a5a] focus:ring-[#0e4a5a]"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.code ? `(${p.code})` : ''}
                      </option>
                    ))}
                    {products.length === 0 && (
                      <option value="">Produto Padrão — Responsabilidade Civil</option>
                    )}
                  </select>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  O cliente iniciará a contratação diretamente no catálogo deste produto.
                </p>
              </div>

              {/* 2. Desconto Pré-Aplicado */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center space-x-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. Desconto Pré-Aplicado</span>
                  </span>
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={discountPercent}
                      onChange={(e) => {
                        const val = Math.min(40, Math.max(0, Number(e.target.value) || 0));
                        setDiscountPercent(val);
                      }}
                      className="form-input text-xs font-bold text-right w-16 py-1 px-2 border-emerald-300 focus:border-emerald-500"
                    />
                    <span className="text-xs font-bold text-emerald-800">%</span>
                  </div>
                </div>

                {/* Slider de 0% a 40% */}
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer h-2 bg-gray-200 rounded-lg"
                />

                {/* Atalhos Rápidos */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {discountShortcuts.map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setDiscountPercent(sc)}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                        discountPercent === sc
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                      }`}
                    >
                      {sc === 0 ? 'Sem desc.' : `${sc}%`}
                    </button>
                  ))}
                </div>

                {/* Impacto Informativo */}
                <div className="pt-2 border-t border-gray-200/60 text-xs">
                  {discountPercent > 0 ? (
                    <div className="space-y-1">
                      <p className="text-emerald-800 font-medium">
                        ✨ Todos os clientes que abrirem este link receberão{' '}
                        <strong>{discountPercent}% de desconto</strong> em qualquer plano escolhido.
                      </p>
                      <p className="text-gray-500 text-[11px]">
                        Comissão líquida estimada do corretor:{' '}
                        <strong className="text-gray-700 font-mono">~{estimatedCommission}%</strong> sobre o prêmio
                        final.
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-[11px]">
                      Nenhum desconto aplicado. O cliente verá os preços integrais padrão do catálogo.
                    </p>
                  )}
                </div>
              </div>

              {/* 3. Rótulo / Campanha (Opcional) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  3. Rótulo Identificador (Opcional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex: Campanha WhatsApp OAB, Dr. Ricardo Santos"
                  className="form-input text-xs w-full py-2 bg-white border-gray-300"
                  maxLength={100}
                />
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Identifique este link para saber de qual cliente ou campanha vieram os cadastros.
                </span>
              </div>

              {/* 4. Validade (Opcional) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  4. Validade do Link
                </label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className="form-input text-xs w-full py-2 bg-white border-gray-300"
                >
                  <option value="">Sem validade (Permanece ativo por tempo indeterminado)</option>
                  <option value="7">Válido por 7 dias</option>
                  <option value="15">Válido por 15 dias</option>
                  <option value="30">Válido por 30 dias</option>
                  <option value="60">Válido por 60 dias</option>
                  <option value="90">Válido por 90 dias</option>
                </select>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary text-xs px-4 py-2.5 cursor-pointer"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary text-xs px-5 py-2.5 flex items-center space-x-2 shadow-sm cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      <span>Gerando Link...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Gerar Link Exclusivo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Tela de Sucesso pós-geração */
            <div className="space-y-5 pt-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950">Link pronto para envio</h4>
                    <p className="text-xs text-emerald-800">
                      {generatedLink.discount_percent > 0 ? (
                        <>
                          Desconto de <strong>{generatedLink.discount_percent}%</strong> fixado para todos os
                          cadastros realizados através deste link.
                        </>
                      ) : (
                        'Link ativo sem desconto pré-aplicado.'
                      )}
                    </p>
                  </div>
                </div>

                {generatedLink.label && (
                  <div className="text-xs text-emerald-900 bg-white/70 px-3 py-1.5 rounded-lg border border-emerald-200 inline-block font-medium">
                    Rótulo: <strong>{generatedLink.label}</strong>
                  </div>
                )}
              </div>

              {/* Campo com Link e Copiar */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Link de Contratação do Cliente</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink.url}
                    className="form-input text-xs font-mono bg-gray-50 text-gray-800 py-2.5 px-3 flex-1 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(generatedLink.url)}
                    className="btn btn-primary text-xs py-2.5 px-4 flex items-center space-x-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Ações Rápidas: WhatsApp e Testar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-2.5 px-3 flex items-center justify-center space-x-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50 bg-emerald-50/30 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>Enviar pelo WhatsApp</span>
                </a>
                <a
                  href={generatedLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-xs py-2.5 px-3 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-gray-600" />
                  <span>Testar Link</span>
                </a>
              </div>

              {/* Rodapé com Fechar e Gerar Outro */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedLink(null);
                    setDiscountPercent(0);
                    setLabel('');
                  }}
                  className="text-xs text-[#0e4a5a] hover:underline font-semibold cursor-pointer"
                >
                  + Gerar outro link
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-primary text-xs py-2 px-5 cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
