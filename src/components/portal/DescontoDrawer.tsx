'use client';

import React, { useEffect } from 'react';
import { 
  X, 
  Percent, 
  TrendingDown, 
  DollarSign, 
  AlertCircle,
  Check
} from 'lucide-react';

import type { Plano } from './CotacaoFormRC';

interface DescontoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  descontoPercentual: number;
  onChangeDesconto: (val: number) => void;
  planoSel: Plano | null;
  planos: Plano[];
  onSelectPlano?: (plano: Plano) => void;
  commissionRate: number; // Taxa percentual, ex: 20
}

function parseMoneyToNumber(v?: string | null): number {
  if (!v) return 0;
  const clean = String(v).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(clean) || 0;
}

function formatCurrency(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DescontoDrawer({
  isOpen,
  onClose,
  descontoPercentual,
  onChangeDesconto,
  planoSel,
  planos,
  onSelectPlano,
  commissionRate = 20,
}: DescontoDrawerProps) {
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

  if (!isOpen) return null;

  // Plano de referência para simulação caso o usuário ainda não tenha selecionado um
  const planoReferencia = planoSel || planos[0] || null;
  const valorOriginal = planoReferencia ? parseMoneyToNumber(planoReferencia.parcela) : 0;
  
  // Teto estrito de 40%
  const descontoValido = Math.min(40, Math.max(0, descontoPercentual || 0));
  const fatorDesconto = 1 - (descontoValido / 100);
  
  const valorComDesconto = Math.round(valorOriginal * fatorDesconto * 100) / 100;
  const valorEconomizado = Math.round((valorOriginal - valorComDesconto) * 100) / 100;

  // Simulação de comissão do parceiro (regra proporcional sobre prêmio líquido final)
  const taxaComissaoFracionada = (commissionRate || 20) / 100;
  const comissaoOriginal = Math.round(valorOriginal * taxaComissaoFracionada * 100) / 100;
  const comissaoComDesconto = Math.round(valorComDesconto * taxaComissaoFracionada * 100) / 100;
  const diferencaComissao = Math.round((comissaoOriginal - comissaoComDesconto) * 100) / 100;

  // Atalhos rápidos
  const atalhos = [0, 5, 10, 15, 20, 25, 30, 35, 40];

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    onChangeDesconto(Math.min(40, Math.max(0, raw)));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = Number(e.target.value);
    if (isNaN(raw)) raw = 0;
    if (raw > 40) raw = 40;
    if (raw < 0) raw = 0;
    onChangeDesconto(raw);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop transparente/escurecido suave */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col border-l border-gray-200 transform transition-transform animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-6 border-b border-gray-200 bg-gray-50/70 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Percent className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-gray-900 text-base">Sistema de Descontos</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                    Até 40%
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Simule o prêmio final e o impacto na comissão
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
              title="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conteúdo rolável */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Seletor de Cobertura para Simulação */}
            {planos.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Plano Base para Simulação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {planos.map((p) => {
                    const isCurrent = planoReferencia?.tipoDePlano === p.tipoDePlano;
                    return (
                      <button
                        key={p.tipoDePlano}
                        type="button"
                        onClick={() => onSelectPlano && onSelectPlano(p)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                          isCurrent
                            ? 'border-primary bg-primary/5 font-bold text-primary shadow-xs'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-semibold truncate">{p.nomeExibido}</div>
                        <div className="text-[11px] text-gray-500 font-normal mt-0.5">
                          {p.cobertura}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!planoSel && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center space-x-1.5 mt-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Nenhum plano foi marcado no formulário ainda. O cálculo abaixo usa este plano como referência.</span>
                  </p>
                )}
              </div>
            )}

            {/* Configuração do Desconto */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Porcentagem de Desconto
                </span>
                <div className="flex items-center space-x-1 bg-white border border-gray-200 px-3 py-1 rounded-lg shadow-2xs">
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={descontoValido}
                    onChange={handleInputChange}
                    className="w-10 text-right font-black text-gray-900 text-sm focus:outline-hidden bg-transparent"
                  />
                  <span className="text-xs font-bold text-gray-500">%</span>
                </div>
              </div>

              {/* Slider com marcação */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={descontoValido}
                  onChange={handleSliderChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-semibold px-0.5">
                  <span>0%</span>
                  <span>10%</span>
                  <span>20%</span>
                  <span>30%</span>
                  <span className="text-primary font-bold">40% (Máx)</span>
                </div>
              </div>

              {/* Atalhos Rápidos */}
              <div>
                <span className="text-[11px] font-semibold text-gray-500 block mb-2">
                  Atalhos Rápidos:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {atalhos.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onChangeDesconto(pct)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                        descontoValido === pct
                          ? 'bg-primary text-white shadow-xs'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {descontoValido >= 40 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2.5 rounded-xl flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>Você atingiu o teto máximo permitido de <strong>40%</strong> de desconto.</span>
                </div>
              )}
            </div>

            {/* Demonstrativo Financeiro do Cliente */}
            <div className="border border-gray-200 rounded-2xl p-5 space-y-3 bg-white">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                <span>Resumo da Proposta</span>
                <span className="font-semibold text-gray-500 normal-case text-xs">
                  {planoReferencia?.nomeExibido || 'Plano'}
                </span>
              </h4>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Valor Original (Tabela)</span>
                  <span className={descontoValido > 0 ? 'line-through text-gray-400 font-medium' : 'font-semibold text-gray-900'}>
                    {formatCurrency(valorOriginal)}
                  </span>
                </div>

                {descontoValido > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700 font-semibold bg-emerald-50/70 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                    <span className="flex items-center space-x-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>Desconto Aplicado ({descontoValido}%)</span>
                    </span>
                    <span>- {formatCurrency(valorEconomizado)}</span>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-2 flex justify-between items-baseline">
                  <span className="text-xs font-bold text-gray-900">Valor Final à Vista</span>
                  <span className="text-xl font-black text-emerald-600">
                    {formatCurrency(valorComDesconto)}
                  </span>
                </div>

                {planoReferencia && planoReferencia.tipoDePlano !== '100k' && (
                  <div className="text-[11px] text-gray-500 text-right">
                    ou em até 6x de aprox. {formatCurrency(valorComDesconto / 6)}
                  </div>
                )}
              </div>
            </div>

            {/* Demonstrativo de Comissão do Parceiro */}
            <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-blue-700" />
                  <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                    Comissão do Parceiro
                  </h4>
                </div>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                  {commissionRate}%
                </span>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <div className="flex justify-between text-blue-900">
                  <span className="text-gray-600">Comissão sem desconto:</span>
                  <span className="font-semibold text-gray-700">{formatCurrency(comissaoOriginal)}</span>
                </div>

                <div className="flex justify-between items-baseline text-blue-950 font-bold bg-white/80 p-2.5 rounded-xl border border-blue-100">
                  <span>Comissão com desconto ({descontoValido}%):</span>
                  <span className="text-sm font-extrabold text-blue-700">
                    {formatCurrency(comissaoComDesconto)}
                  </span>
                </div>

                {descontoValido > 0 && (
                  <div className="flex justify-between text-[11px] text-gray-500 pt-0.5">
                    <span>Impacto na comissão:</span>
                    <span className="text-rose-600 font-semibold">- {formatCurrency(diferencaComissao)}</span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-blue-800/80 leading-relaxed pt-1">
                * A comissão do parceiro é calculada proporcionalmente sobre o prêmio líquido efetivamente contratado pelo cliente.
              </p>
            </div>

          </div>

          {/* Footer / Ações */}
          <div className="p-6 border-t border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row gap-3">
            {descontoValido > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChangeDesconto(0);
                }}
                className="btn btn-secondary text-xs px-4 py-2.5 w-full sm:w-auto"
              >
                Zerar Desconto
              </button>
            )}
            
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary text-xs px-5 py-2.5 flex-1 flex items-center justify-center space-x-2 shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>
                {descontoValido > 0 ? `Aplicar ${descontoValido}% de Desconto` : 'Fechar Painel'}
              </span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
