'use client';

import React from 'react';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  UserCheck,
} from 'lucide-react';
import EditarPropostaButton from '@/components/modals/EditarPropostaButton';
import { formatAtuacao, parseAtuacaoList } from '@/lib/format';
import { getRamoConfig, rcAdvogadosConfig } from '@/lib/product-schemas';

export interface CotacaoInformacoesProfissionaisCardProps {
  cotacao: {
    id: string;
    status: string;
    client_name: string;
    client_cpf_cnpj: string;
    client_email?: string | null;
    client_phone?: string | null;
    importancia_segurada?: number | string | null;
    premio_final?: number | string | null;
    premio_calculado?: number | string | null;
    notes?: string | null;
    client_data?: any;
    product_id?: string | null;
    product_flow_key?: string | null;
    partner_id?: string | null;
  };
  clientData: Record<string, any>;
  readOnlyFinancials?: boolean;
}

export default function CotacaoInformacoesProfissionaisCard({
  cotacao,
  clientData,
  readOnlyFinancials,
}: CotacaoInformacoesProfissionaisCardProps) {
  const cd = clientData || {};

  // Configuração declarativa do ramo para labels e questões
  const ramoConfig =
    getRamoConfig(cotacao.product_flow_key || cotacao.product_id || cd.ramoId) ||
    rcAdvogadosConfig;

  // Associação a Escritório
  const isAssociado =
    cd.associadoEscritorio === 'Sim' ||
    (Boolean(cd.nomeEscritorio) && cd.nomeEscritorio.trim() !== '') ||
    (Boolean(cd.escritorioAssociado) &&
      cd.escritorioAssociado !== 'Não associado' &&
      cd.escritorioAssociado !== 'Não');

  const nomeEscritorio =
    cd.nomeEscritorio ||
    (isAssociado ? cd.escritorioAssociado || cd.escritorio : null);

  // Áreas de atuação
  const especialidadesKeys = Array.isArray(cd.especialidades)
    ? cd.especialidades
    : parseAtuacaoList(cd.atuacao);

  // Mapeia chaves para os rótulos amigáveis do ramo
  const areasFormatadas: string[] = [];
  if (ramoConfig?.especialidades && ramoConfig.especialidades.length > 0) {
    const mapaRamo = new Map(ramoConfig.especialidades.map((e) => [e.key, e.label]));
    especialidadesKeys.forEach((key: string) => {
      const label = mapaRamo.get(key) || key;
      if (!areasFormatadas.includes(label)) areasFormatadas.push(label);
    });
  }
  if (areasFormatadas.length === 0 && cd.atuacao) {
    const strAtuacao = formatAtuacao(cd.atuacao);
    if (strAtuacao && strAtuacao !== 'Não informado') {
      areasFormatadas.push(strAtuacao);
    }
  }

  // Declarações de Risco do Questionário
  const questoesRisco = ramoConfig?.questionarioRisco || rcAdvogadosConfig.questionarioRisco;
  const ocorrenciasRisco: {
    pergunta: string;
    resposta: string;
    detalhe: string;
  }[] = [];

  questoesRisco.forEach((q) => {
    const resp = String(cd[q.id] || 'Não');
    const det = String(cd[q.detailKey] || '').trim();
    if (resp === 'Sim' || det !== '') {
      ocorrenciasRisco.push({
        pergunta: q.question,
        resposta: resp,
        detalhe: det || 'Sem detalhamento adicional informado.',
      });
    }
  });

  const temRiscoDeclarado = ocorrenciasRisco.length > 0;

  // Seguro Anterior / Renovação
  const isRenovacao =
    cd.isRenovacao === 'Sim' ||
    cd.renovacao === true ||
    cd.renovacao === 'Sim' ||
    Boolean(cd.seguradora);

  // PPE
  const isPpe =
    cd.ppeCargos === 'Sim' ||
    cd.ppeCargos === true ||
    cd.ppeRepresenta === 'Sim' ||
    cd.ppeRepresenta === true;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
      {/* Header com Ação de Edição */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Briefcase size={16} className="text-cyan-600" />
          Escritório & Histórico de Risco
        </h2>

        <div className="flex items-center gap-2">
          <EditarPropostaButton
            cotacao={{
              id: cotacao.id,
              status: cotacao.status,
              client_name: cotacao.client_name,
              client_cpf_cnpj: cotacao.client_cpf_cnpj,
              client_email: cotacao.client_email,
              client_phone: cotacao.client_phone,
              importancia_segurada: cotacao.importancia_segurada,
              premio_final:
                cotacao.premio_final ??
                cotacao.premio_calculado ??
                (cd.valor ? Number(cd.valor) : null),
              notes: cotacao.notes ? String(cotacao.notes) : null,
              client_data: cd,
              product_id: cotacao.product_id,
              product_flow_key: cotacao.product_flow_key,
              partner_id: cotacao.partner_id,
            }}
            initialTab="escritorio"
            readOnlyFinancials={readOnlyFinancials}
            variant="ghost"
            size="sm"
          >
            <span className="text-xs text-[#0e4a5a] font-semibold hover:underline">
              ✏️ Editar Informações
            </span>
          </EditarPropostaButton>
        </div>
      </div>

      {/* BLOCO 1: ESCRITÓRIO E DADOS PROFISSIONAIS */}
      <div className="space-y-3">
        <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">
          Estrutura & Informações de Escritório
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div className="p-3 bg-gray-50/80 border border-gray-200/70 rounded-xl space-y-1">
            <span className="text-gray-500 font-medium block flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#0e4a5a]" />
              Associação a Escritório
            </span>
            <div className="flex items-center gap-2 pt-0.5">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  isAssociado
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300'
                }`}
              >
                {isAssociado ? 'Associado' : 'Não Associado'}
              </span>
              {isAssociado && nomeEscritorio && (
                <span className="font-semibold text-gray-900 truncate" title={nomeEscritorio}>
                  {nomeEscritorio}
                </span>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50/80 border border-gray-200/70 rounded-xl space-y-1">
            <span className="text-gray-500 font-medium block flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#0e4a5a]" />
              Titularidade & Grau
            </span>
            <span className="font-bold text-gray-900 block pt-0.5">
              {String(cd.titularidade || cd.titularidadeTipo || 'Individual / Bacharel')}
              {cd.titularidadeOutro ? ` (${cd.titularidadeOutro})` : ''}
            </span>
          </div>

          {/* Faturamentos (se preenchidos) */}
          {(Boolean(cd.faturamentoAntes) || Boolean(cd.faturamentoDepois)) && (
            <>
              <div className="p-3 bg-gray-50/80 border border-gray-200/70 rounded-xl space-y-1">
                <span className="text-gray-500 font-medium block">
                  Faturamento Bruto Anual (Últimos 12m)
                </span>
                <span className="font-bold text-gray-900 block pt-0.5">
                  {cd.faturamentoAntes || 'Não informado'}
                </span>
              </div>

              <div className="p-3 bg-gray-50/80 border border-gray-200/70 rounded-xl space-y-1">
                <span className="text-gray-500 font-medium block">
                  Faturamento Estimado (Próximos 12m)
                </span>
                <span className="font-bold text-gray-900 block pt-0.5">
                  {cd.faturamentoDepois || 'Não informado'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Áreas de Atuação Jurídica */}
        <div className="pt-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px] mb-2">
            Áreas de Atuação & Especialidades Declaradas
          </span>
          {areasFormatadas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {areasFormatadas.map((area, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 text-[#0e4a5a] border border-[#00d4e0]/30 shadow-2xs"
                >
                  {area}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-500 italic block">
              Nenhuma área específica marcada.
            </span>
          )}
        </div>
      </div>

      {/* BLOCO 2: HISTÓRICO DE RISCO (UNDERWRITING) */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">
            Declarações de Risco & Underwriting (5 Perguntas)
          </span>
          <EditarPropostaButton
            cotacao={{
              id: cotacao.id,
              status: cotacao.status,
              client_name: cotacao.client_name,
              client_cpf_cnpj: cotacao.client_cpf_cnpj,
              client_email: cotacao.client_email,
              client_phone: cotacao.client_phone,
              importancia_segurada: cotacao.importancia_segurada,
              premio_final:
                cotacao.premio_final ??
                cotacao.premio_calculado ??
                (cd.valor ? Number(cd.valor) : null),
              notes: cotacao.notes ? String(cotacao.notes) : null,
              client_data: cd,
              product_id: cotacao.product_id,
              product_flow_key: cotacao.product_flow_key,
              partner_id: cotacao.partner_id,
            }}
            initialTab="risco"
            readOnlyFinancials={readOnlyFinancials}
            variant="ghost"
            size="sm"
          >
            <span className="text-[11px] text-[#0e4a5a] font-semibold hover:underline">
              Corrigir Respostas
            </span>
          </EditarPropostaButton>
        </div>

        {!temRiscoDeclarado ? (
          /* Estado Seguro: Nenhuma ocorrência declarada */
          <div className="bg-emerald-50/80 border border-emerald-200 text-emerald-950 p-3.5 rounded-xl flex items-start gap-2.5 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-emerald-950 block">
                Questionário sem apontamentos de risco
              </strong>
              <span className="text-emerald-800 leading-relaxed block mt-0.5">
                O proponente respondeu &quot;Não&quot; a todas as perguntas de sinistros anteriores,
                recusas de seguro, processos éticos (OAB/TED) e litígios com terceiros.
              </span>
            </div>
          </div>
        ) : (
          /* Alerta: Ocorrências de risco declaradas */
          <div className="bg-amber-50/90 border border-amber-200 text-amber-950 p-3.5 rounded-xl space-y-2.5 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <strong className="font-bold text-amber-950">
                Atenção: Constam {ocorrenciasRisco.length} declaração(ões) com apontamento de risco
              </strong>
            </div>

            <div className="space-y-2 pt-1 border-t border-amber-200/80">
              {ocorrenciasRisco.map((oc, idx) => (
                <div key={idx} className="bg-white/90 p-2.5 rounded-lg border border-amber-200/80 space-y-1">
                  <span className="font-bold text-amber-950 block">
                    {oc.pergunta}
                  </span>
                  <p className="text-slate-700 text-[11px] leading-relaxed m-0">
                    <strong className="text-amber-900">Detalhamento:</strong> {oc.detalhe}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BLOCO 3: SEGURO ANTERIOR / RENOVAÇÃO (Se aplicável) */}
      {isRenovacao && (
        <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
          <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[11px]">
            Histórico de Seguro Anterior (Renovação)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-gray-50 border border-gray-200/70 rounded-xl">
            <div>
              <span className="text-gray-500 block text-[11px]">Seguradora</span>
              <strong className="text-gray-900 block">{cd.seguradora || 'Não informada'}</strong>
            </div>
            <div>
              <span className="text-gray-500 block text-[11px]">Limite Anterior</span>
              <strong className="text-gray-900 block">{cd.limite || 'Não informado'}</strong>
            </div>
            <div>
              <span className="text-gray-500 block text-[11px]">Franquia Anterior</span>
              <strong className="text-gray-900 block">{cd.franquiaAnterior || 'Não informada'}</strong>
            </div>
            <div>
              <span className="text-gray-500 block text-[11px]">Data Retroativa</span>
              <strong className="text-gray-900 block">{cd.dataRetroativa || 'Início de vigência'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* BLOCO 4: PESSOA POLITICAMENTE EXPOSTA (PPE) */}
      <div className="pt-3 border-t border-slate-100 text-xs flex items-center justify-between">
        <span className="text-gray-500 font-medium">Pessoa Politicamente Exposta (PPE):</span>
        {isPpe ? (
          <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px]">
            <AlertCircle size={12} />
            {cd.ppeCargoSelect ? `Sim (${cd.ppeCargoSelect})` : 'Sim (Declaração Afirmativa)'}
          </span>
        ) : (
          <span className="text-gray-600 font-medium">Não (Sem cargos públicos relevantes)</span>
        )}
      </div>
    </div>
  );
}
