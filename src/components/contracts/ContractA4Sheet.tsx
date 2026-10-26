import React from 'react';
import type { CorretoraContratoData } from '@/types/contract';

export interface ContractA4SheetProps {
  children?: React.ReactNode;
  corretora?: CorretoraContratoData;
  /**
   * Caminho ou URL da imagem de fundo timbrada.
   * Padrão: '/images/contrato-kev/kev-background.jpg'
   */
  backgroundUrl?: string;
  /**
   * Se ativo, oculta marcas d'água ou fundos para impressão em papel timbrado pré-impresso.
   */
  hideBackground?: boolean;
  /**
   * Identificador do container para impressão direcionada.
   */
  id?: string;
  className?: string;
}

/**
 * Componente base que representa uma folha A4 milimetricamente calibrada (210mm x 297mm)
 * com cabeçalho timbrado (Corretora, DuoLife e Kev Seguros), rodapé institucional e
 * fundo timbrado com a marca d'água geométrica da Kev Seguros.
 */
export function ContractA4Sheet({
  children,
  corretora,
  backgroundUrl = '/images/contrato-kev/kev-background.jpg',
  hideBackground = false,
  id = 'contract-a4-sheet',
  className = '',
}: ContractA4SheetProps) {
  const corretoraNome =
    corretora?.nomeFantasia ||
    corretora?.razaoSocial ||
    corretora?.nome ||
    'Corretora Parceira';

  return (
    <div
      id={id}
      className={`contract-sheet-root relative w-[210mm] h-[297mm] min-w-[210mm] max-w-[210mm] min-h-[297mm] max-h-[297mm] bg-white text-slate-900 overflow-hidden box-border shadow-xl print:shadow-none print:m-0 print:border-none ${className}`}
      style={{
        pageBreakAfter: 'always',
        breakAfter: 'page',
        // Garante que browsers respeitem fundos e cores na impressão
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {/* 1. Imagem de fundo timbrada / Marca d'água geométrica */}
      {!hideBackground && backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0 print:opacity-100"
        />
      )}

      {/* 2. Conteúdo sobreposto estruturado em Flexbox (Header, Body, Footer) */}
      <div className="relative z-10 flex flex-col justify-between h-full px-[14mm] pt-[10mm] pb-[8mm] box-border">
        {/* --- CABEÇALHO TIMBRADO --- */}
        <header className="flex items-center justify-between border-b border-slate-200/60 pb-3 mb-2">
          {/* Lado Esquerdo: Logotipo da Corretora ou Nome Estilizado */}
          <div className="flex items-center min-w-[120px] max-w-[200px]">
            {corretora?.logoUrl ? (
              <img
                src={corretora.logoUrl}
                alt={corretoraNome}
                className="max-h-[36px] max-w-[150px] object-contain"
              />
            ) : (
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-tight line-clamp-2">
                  {corretoraNome}
                </span>
                <span className="text-[7.5px] font-semibold text-emerald-800 tracking-wider uppercase">
                  Corretora de Seguros
                </span>
              </div>
            )}
          </div>

          {/* Lado Direito: Logos Oficiais DuoLife e KEV Seguros */}
          <div className="flex items-center gap-3.5">
            {/* Logo DuoLife */}
            <div className="flex items-center">
              <img
                src="/images/contrato-kev/duolife-logo.jpg"
                alt="DuoLife Hub de Negócios"
                className="h-[28px] w-auto object-contain"
              />
            </div>

            {/* Separador vertical sutil */}
            <div className="h-6 w-px bg-slate-300" />

            {/* Logo KEV Seguros */}
            <div className="flex items-center">
              <img
                src="/images/contrato-kev/kev-logo.jpg"
                alt="KEV Seguros"
                className="h-[18px] w-auto object-contain"
              />
            </div>
          </div>
        </header>

        {/* --- CORPO PRINCIPAL DO CONTRATO --- */}
        <main className="flex-1 flex flex-col justify-start overflow-hidden">
          {children}
        </main>

        {/* --- RODAPÉ INSTITUCIONAL KEV SEGUROS --- */}
        <footer className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-center select-none">
          {/* Chevron Esquerdo */}
          <div className="w-5 flex justify-center items-center">
            <img
              src="/images/contrato-kev/chevron-left.jpg"
              alt=""
              aria-hidden="true"
              className="h-3 w-auto object-contain"
            />
          </div>

          {/* Endereço e Link Centralizados */}
          <div className="flex-1 px-2 text-slate-700">
            <p className="text-[7.5px] leading-tight text-slate-600 font-normal">
              Avenida Brigadeiro Faria Lima, 3477, Torre B, 2º andar. Itaim Bibi, São Paulo - SP, 04538-133
            </p>
            <p className="text-[8px] leading-tight font-bold text-slate-900 mt-0.5 tracking-tight">
              kevseguros.com.br
            </p>
          </div>

          {/* Chevron Direito */}
          <div className="w-5 flex justify-center items-center">
            <img
              src="/images/contrato-kev/chevron-right.jpg"
              alt=""
              aria-hidden="true"
              className="h-3 w-auto object-contain"
            />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default ContractA4Sheet;
