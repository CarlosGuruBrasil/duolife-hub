'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  QrCode,
  Download,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
  FileImage,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { toast } from '@/components/ui/toast/toast';
import {
  generateQrCodeSvg,
  generateQrCodeDataUrl,
  generateDisplayCardSvg,
  ensureReadableColor,
  type DisplayCardParams,
} from '@/lib/qr-code';

export interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  companyName?: string;
  companySlogan?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  label?: string | null;
  discountPercent?: number | null;
  sellerName?: string | null;
}

export default function QrCodeModal({
  isOpen,
  onClose,
  url,
  title = 'QR Code de Divulgação',
  companyName = 'Sua Corretora',
  companySlogan,
  companyPhone,
  companyEmail,
  logoUrl,
  primaryColor,
  accentColor,
  label,
  discountPercent,
  sellerName,
}: QrCodeModalProps) {
  useBodyScrollLock(isOpen);

  const [activeTab, setActiveTab] = useState<'direct' | 'card'>('direct');
  const [directSvg, setDirectSvg] = useState<string>('');
  const [directPngUrl, setDirectPngUrl] = useState<string>('');
  const [cardSvg, setCardSvg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  const safePrimary = ensureReadableColor(primaryColor, '#0e4a5a');

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

  // Gera os assets (SVG e PNG) quando abrir o modal ou mudar parâmetros
  useEffect(() => {
    if (!isOpen || !url) return;

    let isMounted = true;
    setLoading(true);

    async function loadAssets() {
      try {
        const [svgText, dataUrl] = await Promise.all([
          generateQrCodeSvg(url, { color: safePrimary, margin: 2, width: 400 }),
          generateQrCodeDataUrl(url, { color: safePrimary, margin: 2, width: 1024 }),
        ]);

        const cardParams: DisplayCardParams = {
          url,
          companyName,
          companySlogan,
          companyPhone,
          companyEmail,
          logoUrl,
          primaryColor: safePrimary,
          accentColor,
          label,
          discountPercent,
          sellerName,
        };

        const displayCardSvgText = await generateDisplayCardSvg(cardParams);

        if (isMounted) {
          setDirectSvg(svgText);
          setDirectPngUrl(dataUrl);
          setCardSvg(displayCardSvgText);
          setLoading(false);
        }
      } catch (err) {
        console.error('Erro ao gerar QR Code:', err);
        if (isMounted) {
          toast.error('Não foi possível gerar o QR Code');
          setLoading(false);
        }
      }
    }

    loadAssets();

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    url,
    safePrimary,
    companyName,
    companySlogan,
    companyPhone,
    companyEmail,
    logoUrl,
    accentColor,
    label,
    discountPercent,
    sellerName,
  ]);

  if (!isOpen) return null;

  // Sanitiza nome de arquivo para download
  const sanitizeFileName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const fileBaseName = `qrcode-${sanitizeFileName(companyName || 'corretora')}-${sanitizeFileName(label || 'link')}`;

  /**
   * Converte uma string SVG em um Blob PNG rasterizado usando HTML5 Canvas no cliente.
   */
  const convertSvgToPngBlob = (svgString: string, width = 800, height = 1100): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URLObj = window.URL || window.webkitURL || window;
      const blobUrl = URLObj.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // Escala 2x para nitidez em telas retina / impressão
          const scale = 2;
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context indisponível'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            URLObj.revokeObjectURL(blobUrl);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Falha ao converter canvas para blob PNG'));
            }
          }, 'image/png');
        } catch (err) {
          URLObj.revokeObjectURL(blobUrl);
          reject(err);
        }
      };

      img.onerror = (e) => {
        URLObj.revokeObjectURL(blobUrl);
        reject(new Error('Falha ao renderizar imagem SVG'));
      };

      img.src = blobUrl;
    });
  };

  /**
   * Baixar arquivo PNG
   */
  const handleDownloadPng = async () => {
    try {
      setDownloading(true);
      if (activeTab === 'direct') {
        // Para QR Code direto, usa o DataURL de alta resolução gerado pelo QRCode nativo
        const link = document.createElement('a');
        link.download = `${fileBaseName}-direto.png`;
        link.href = directPngUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('QR Code PNG baixado com sucesso!');
      } else {
        // Para o Display Card, rasteriza o SVG em 1600x2200px
        const blob = await convertSvgToPngBlob(cardSvg, 800, 1100);
        const urlObj = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${fileBaseName}-cartao-divulgacao.png`;
        link.href = urlObj;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(urlObj);
        toast.success('Cartão de Divulgação PNG baixado em alta resolução!');
      }
    } catch (err) {
      console.error('Erro ao baixar PNG:', err);
      toast.error('Não foi possível gerar o download em PNG');
    } finally {
      setDownloading(false);
    }
  };

  /**
   * Baixar arquivo SVG vetorial
   */
  const handleDownloadSvg = () => {
    try {
      const svgContent = activeTab === 'direct' ? directSvg : cardSvg;
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const urlObj = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${fileBaseName}-${activeTab === 'direct' ? 'direto' : 'cartao'}.svg`;
      link.href = urlObj;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(urlObj);
      toast.success('Arquivo SVG vetorial baixado!');
    } catch (err) {
      console.error('Erro ao baixar SVG:', err);
      toast.error('Erro ao exportar SVG');
    }
  };

  /**
   * Copiar imagem para a Área de Transferência (Clipboard API)
   */
  const handleCopyImage = async () => {
    try {
      if (typeof window !== 'undefined' && 'clipboard' in navigator && typeof ClipboardItem !== 'undefined') {
        let blob: Blob;
        if (activeTab === 'direct') {
          // Converte o dataUrl para Blob
          const res = await fetch(directPngUrl);
          blob = await res.blob();
        } else {
          blob = await convertSvgToPngBlob(cardSvg, 800, 1100);
        }

        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
          }),
        ]);

        setCopied(true);
        toast.success('Imagem copiada para a área de transferência! Cole no WhatsApp, Canva ou e-mail.');
        setTimeout(() => setCopied(false), 3000);
      } else {
        // Fallback: copia a URL
        await navigator.clipboard.writeText(url);
        toast.info('Seu navegador não permite colar imagens diretamente. Copiamos o link do QR Code!');
      }
    } catch (err) {
      console.warn('Erro ao copiar imagem:', err);
      // Fallback seguro: copia link
      await navigator.clipboard.writeText(url);
      toast.info('Link copiado para a área de transferência!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col border border-gray-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-qr-title"
      >
        {/* Cabeçalho do Modal */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ backgroundColor: safePrimary }}
            >
              <QrCode size={20} />
            </div>
            <div>
              <h3 id="modal-qr-title" className="text-base font-bold text-gray-900 leading-snug">
                {title}
              </h3>
              <p className="text-xs text-gray-500">
                Código com identidade visual pronta para materiais impressos e digitais
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-xl transition-all cursor-pointer"
            aria-label="Fechar modal de QR Code"
          >
            <X size={18} />
          </button>
        </div>

        {/* Seletor de Modo: QR Code Direto vs Cartão de Divulgação */}
        <div className="px-4 sm:px-5 pt-3 pb-1 border-b border-gray-100 bg-gray-50/50">
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('direct')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'direct'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <QrCode size={14} className={activeTab === 'direct' ? 'text-[#0e4a5a]' : 'text-gray-400'} />
              <span>QR Code Direto</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('card')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'card'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <FileImage size={14} className={activeTab === 'card' ? 'text-emerald-600' : 'text-gray-400'} />
              <span>Cartão de Balcão (Display)</span>
            </button>
          </div>
        </div>

        {/* Conteúdo Principal com Preview */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0e4a5a] mx-auto"></div>
              <p className="text-xs text-gray-500 font-medium">Gerando QR Code em alta resolução...</p>
            </div>
          ) : (
            <>
              {activeTab === 'direct' ? (
                /* MODO 1: QR CODE DIRETO */
                <div className="space-y-4 text-center">
                  <div className="inline-block p-4 sm:p-6 bg-white rounded-2xl border-2 border-gray-200 shadow-md transition-all hover:shadow-lg">
                    {directSvg ? (
                      <div
                        className="w-56 h-56 sm:w-64 sm:h-64 mx-auto [&>svg]:w-full [&>svg]:h-full"
                        dangerouslySetInnerHTML={{ __html: directSvg }}
                      />
                    ) : (
                      <div className="w-56 h-56 flex items-center justify-center text-xs text-gray-400">
                        Carregando...
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-800">
                      Cor primária aplicada: <span className="font-mono text-[#0e4a5a]">{safePrimary}</span>
                    </p>
                    <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                      Contraste validado matematicamente (WCAG) para leitura instantânea por qualquer câmera de smartphone.
                    </p>
                  </div>
                </div>
              ) : (
                /* MODO 2: CARTÃO DE BALCÃO / DISPLAY CARD */
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 text-center">
                    Plaquinha completa com a marca da sua corretora, instruções e chamada para contratação.
                  </div>
                  <div className="border border-gray-200 rounded-2xl bg-gray-50/70 p-2 sm:p-3 overflow-hidden shadow-inner flex items-center justify-center">
                    <div className="max-w-[340px] sm:max-w-[380px] w-full rounded-xl shadow-lg border border-gray-200 bg-white overflow-hidden [&>svg]:w-full [&>svg]:h-auto">
                      {cardSvg && <div dangerouslySetInnerHTML={{ __html: cardSvg }} />}
                    </div>
                  </div>
                </div>
              )}

              {/* URL de Destino com botão rápido de teste */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-1.5 text-left">
                <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500">
                  <span>URL de Destino do QR Code</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0e4a5a] hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    Abrir link <ExternalLink size={10} />
                  </a>
                </div>
                <p className="text-xs font-mono text-gray-700 break-all select-all">{url}</p>
              </div>
            </>
          )}
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={loading}
            className="w-full sm:w-auto btn btn-secondary text-xs py-2.5 px-4 flex items-center justify-center gap-2 cursor-pointer border-gray-300 hover:bg-gray-50"
            title="Copiar imagem rasterizada para colar em conversas ou designs"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Imagem Copiada!' : 'Copiar Imagem'}</span>
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadSvg}
              disabled={loading}
              className="flex-1 sm:flex-initial btn btn-secondary text-xs py-2.5 px-3.5 flex items-center justify-center gap-1.5 cursor-pointer border-gray-300 hover:bg-gray-50"
              title="Baixar em formato vetorial SVG para impressão profissional"
            >
              <Download size={14} />
              <span>SVG Vetorial</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={loading || downloading}
              className="flex-1 sm:flex-initial btn btn-primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              title="Baixar em imagem PNG em alta resolução"
            >
              <Download size={14} />
              <span>{downloading ? 'Processando...' : 'Baixar PNG (Alta Res.)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
