'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Printer,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Code2,
  FileCheck2,
  Layers,
  ArrowLeft,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { ContractA4Sheet, RcAdvogadoContractTemplate } from '@/components/contracts';
import type { ContractData } from '@/types/contract';

const MOCK_DATA_REAL: ContractData = {
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

export default function ContratoPreviewPage() {
  const [usePlaceholders, setUsePlaceholders] = useState(false);
  const [backgroundType, setBackgroundType] = useState<'padrao' | 'neutra' | 'nenhum'>('padrao');
  const [zoom, setZoom] = useState(100);

  const bgUrl =
    backgroundType === 'padrao'
      ? '/images/contrato-kev/kev-background.jpg'
      : backgroundType === 'neutra'
      ? '/images/contrato-kev/Timbragem_Documento_Neutra_300dpi.png'
      : undefined;

  const handlePrint = () => {
    window.print();
  };

  const currentData: ContractData = {
    ...MOCK_DATA_REAL,
    usePlaceholders,
  };

  return (
    <>
      {/* Estilos globais para impressão perfeita A4: oculta toda a navegação e controles */}
      <style jsx global>{`
        @media print {
          /* Oculta tudo na tela fora da folha */
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          header,
          nav,
          aside,
          .no-print,
          [data-admin-shell-header],
          [data-admin-shell-sidebar] {
            display: none !important;
          }
          /* Oculta wrappers do AdminShell */
          .admin-main-content {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          /* Fixa a folha A4 no canto 0,0 com tamanho e proporção internacional */
          #contract-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            z-index: 999999 !important;
            visibility: visible !important;
          }
          #contract-print-area * {
            visibility: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      <div className="flex flex-col min-h-full pb-16">
        {/* BARRA DE CONTROLE SUPERIOR (NO-PRINT) */}
        <div className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 px-6 py-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
            {/* Título e Navegação */}
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                title="Voltar ao Painel"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-gray-900">
                    Preview do Contrato A4
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> HTML + Tailwind
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Seguro de Responsabilidade Civil para Advogados • Papel A4 (210 × 297mm)
                </p>
              </div>
            </div>

            {/* Ações e Controles */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Seletor de Modo: Dados Reais vs Placeholders */}
              <div className="flex items-center rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs">
                <button
                  type="button"
                  onClick={() => setUsePlaceholders(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    !usePlaceholders
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Dados Reais
                </button>
                <button
                  type="button"
                  onClick={() => setUsePlaceholders(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    usePlaceholders
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Placeholders {'{{...}}'}
                </button>
              </div>

              {/* Seletor de Fundo Timbrado */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs">
                <span className="px-2 text-gray-500 flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Fundo:
                </span>
                <button
                  type="button"
                  onClick={() => setBackgroundType('padrao')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                    backgroundType === 'padrao'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Fundo oficial Kev Seguros (JPG calibrado)"
                >
                  Oficial Kev
                </button>
                <button
                  type="button"
                  onClick={() => setBackgroundType('neutra')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                    backgroundType === 'neutra'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Timbragem Neutra 300 DPI"
                >
                  Neutra 300 DPI
                </button>
                <button
                  type="button"
                  onClick={() => setBackgroundType('nenhum')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                    backgroundType === 'nenhum'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Sem marca d'água (Papel pré-timbrado)"
                >
                  Sem Fundo
                </button>
              </div>

              {/* Controles de Zoom */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  className="p-1.5 rounded-lg hover:bg-white text-gray-700 transition-colors"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center font-bold text-gray-800">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="p-1.5 rounded-lg hover:bg-white text-gray-700 transition-colors"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="p-1.5 rounded-lg hover:bg-white text-gray-500 hover:text-gray-800 transition-colors border-l border-gray-200"
                  title="Resetar Zoom (100%)"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>

              {/* Botão Imprimir / Salvar PDF */}
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition-all hover:scale-105 active:scale-95"
              >
                <Printer className="h-4 w-4" />
                Imprimir / Salvar PDF
              </button>
            </div>
          </div>
        </div>

        {/* ÁREA DE EXIBIÇÃO DA FOLHA A4 */}
        <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-slate-200/60 print:bg-white print:p-0">
          <div
            id="contract-print-area"
            style={{
              transform: zoom !== 100 ? `scale(${zoom / 100})` : 'none',
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
            className="transition-all"
          >
            <ContractA4Sheet
              corretora={currentData.corretora}
              backgroundUrl={bgUrl}
              hideBackground={backgroundType === 'nenhum'}
            >
              <RcAdvogadoContractTemplate
                data={currentData}
                forcePlaceholders={usePlaceholders}
              />
            </ContractA4Sheet>
          </div>
        </div>
      </div>
    </>
  );
}
