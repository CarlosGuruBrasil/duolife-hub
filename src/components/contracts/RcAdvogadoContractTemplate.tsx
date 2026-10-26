import React from 'react';
import type { ContractData } from '@/types/contract';

export interface RcAdvogadoContractTemplateProps {
  data?: ContractData;
  /**
   * Força a exibição de placeholders de variáveis como {{nome}}, {{cpf}}, etc.
   */
  forcePlaceholders?: boolean;
  customTitulo?: string;
  customSubtitulo?: string;
  customDeclaracaoTexto?: string;
}

/**
 * Componente do Termo de Adesão para Seguro de Responsabilidade Civil para Advogados.
 * Segue com rigorosa fidelidade visual o padrão timbrado oficial:
 * - Cabeçalhos de tabela com fundo cinza (bg-slate-100 border border-slate-300 font-bold)
 * - Tabela do Proponente com 5 linhas estruturadas
 * - Bloco de Declaração do Proponente
 * - Tabela de Condições de Comercialização (4 linhas x 2 colunas)
 * - Data e Cidade centralizados
 * - Linhas de Assinatura com âncoras ZapSign ({{assinatura_corretora}} e {{assinatura_proponente}})
 */
export function RcAdvogadoContractTemplate({
  data,
  forcePlaceholders = false,
  customTitulo,
  customSubtitulo,
  customDeclaracaoTexto,
}: RcAdvogadoContractTemplateProps) {
  const isPlaceholder = forcePlaceholders || data?.usePlaceholders;

  // Extração ou resolução de Proponente
  const pNome = isPlaceholder ? '{{nome}}' : (data?.proponente?.nome || 'Dr(a). Não informado');
  const pNasc = isPlaceholder ? '{{dataNascimento}}' : (data?.proponente?.dataNascimento || 'Não informado');
  const pCpf = isPlaceholder ? '{{cpf}}' : (data?.proponente?.cpf || 'Não informado');
  const pEmail = isPlaceholder ? '{{email}}' : (data?.proponente?.email || 'Não informado');
  const pCelular = isPlaceholder ? '{{celular}}' : (data?.proponente?.celular || 'Não informado');
  const pEndereco = isPlaceholder ? '{{endereco}}' : (data?.proponente?.endereco || 'Não informado');
  const pInicio = isPlaceholder ? '{{inicioProfissional}}' : (data?.proponente?.inicioProfissional || 'Não informado');
  const pOab = isPlaceholder ? '{{oab}}' : (data?.proponente?.oab || data?.proponente?.registroValor || 'Não informado');

  // Condições de Comercialização
  const cImportancia = isPlaceholder ? '{{importanciaSegurada}}' : (data?.condicoes?.importanciaSegurada || 'R$ 100.000,00');
  const cFranquia = isPlaceholder ? '{{franquia}}' : (data?.condicoes?.franquia || 'Não há aplicação de franquia');
  const cPremio = isPlaceholder ? '{{valorPremio}}' : (data?.condicoes?.valorPremio || 'R$ 790,00');
  const cFormaPag = isPlaceholder ? '{{formaPagamento}}' : (data?.condicoes?.formaPagamento || '1x à vista no Boleto ou Cartão de Crédito');
  const cVigencia = isPlaceholder ? '{{vigencia}}' : (data?.condicoes?.vigencia || '1 ano');
  const cEstipulante = isPlaceholder ? '{{estipulante}}' : (data?.condicoes?.estipulante || 'DUOLIFE PLATAFORMA DE NEGÓCIOS');
  const cCorretora = isPlaceholder
    ? '{{corretora}}'
    : (data?.condicoes?.corretora || data?.corretora?.nomeFantasia || data?.corretora?.razaoSocial || data?.corretora?.nome || 'Corretora Parceira');
  const cSeguradora = isPlaceholder ? '{{seguradora}}' : (data?.condicoes?.seguradora || 'AKAD SEGUROS S.A.');

  // Data e Cidade
  const dataCidadeTexto = isPlaceholder
    ? '{{cidadeCorretora}}, {{dia}} de {{mes}} de {{ano}}'
    : `${data?.dataCidade?.cidade || data?.corretora?.cidade || 'São Paulo'}, ${data?.dataCidade?.dia || new Date().getDate()} de ${data?.dataCidade?.mes || 'Outubro'} de ${data?.dataCidade?.ano || new Date().getFullYear()}`;

  // Nomes nas Assinaturas
  const signCorretora = isPlaceholder ? '{{nomeCorretora}}' : cCorretora;
  const signProponente = isPlaceholder ? '{{nomeProponente}}' : pNome;

  return (
    <div className="flex flex-col h-full justify-between gap-2.5 text-slate-800">
      {/* 1. TÍTULO E SUBTÍTULO DO DOCUMENTO */}
      <div className="text-center pt-1 pb-1">
        <h1 className="text-[12px] font-black tracking-tight text-slate-900 uppercase">
          {customTitulo || 'Seguro de Responsabilidade Civil para Advogado'}
        </h1>
        <h2 className="text-[9.5px] font-medium text-slate-700 tracking-normal mt-0.5">
          {customSubtitulo || 'Termo de Adesão por parte do Advogado'}
        </h2>
      </div>

      {/* 2. SEÇÃO PROPONENTE */}
      <section className="w-full">
        {/* Cabeçalho de Seção */}
        <div className="bg-slate-100 border border-slate-300 font-bold px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-slate-900">
          PROPONENTE
        </div>

        {/* Tabela de Dados Cadastrais */}
        <div className="border-x border-b border-slate-300 bg-white text-[8px] flex flex-col">
          {/* Linha 1: Nome */}
          <div className="flex border-b border-slate-300">
            <div className="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Nome:
            </div>
            <div className="flex-1 px-2 py-1 font-bold text-slate-900 truncate">
              {pNome}
            </div>
          </div>

          {/* Linha 2: Nascimento e CPF */}
          <div className="flex border-b border-slate-300">
            <div className="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Nascimento:
            </div>
            <div className="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              {pNasc}
            </div>
            <div className="w-[65px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              CPF:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {pCpf}
            </div>
          </div>

          {/* Linha 3: E-mail e Celular */}
          <div className="flex border-b border-slate-300">
            <div className="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              E-mail:
            </div>
            <div className="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              {pEmail}
            </div>
            <div className="w-[65px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Celular:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {pCelular}
            </div>
          </div>

          {/* Linha 4: Endereço */}
          <div className="flex border-b border-slate-300">
            <div className="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Endereço:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {pEndereco}
            </div>
          </div>

          {/* Linha 5: Início profissional e OAB */}
          <div className="flex">
            <div className="w-[115px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Início profissional:
            </div>
            <div className="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              {pInicio}
            </div>
            <div className="w-[65px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              OAB:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {pOab}
            </div>
          </div>
        </div>
      </section>

      {/* 3. SEÇÃO DECLARAÇÃO DO PROPONENTE */}
      <section className="w-full">
        {/* Cabeçalho de Seção */}
        <div className="bg-slate-100 border border-slate-300 font-bold px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-slate-900">
          DECLARAÇÃO DO PROPONENTE
        </div>

        {/* Texto Legal Justificado */}
        <div className="border-x border-b border-slate-300 bg-white/95 p-2 text-justify text-[7.5px] leading-[1.38] text-slate-800">
          <p>
            {customDeclaracaoTexto || 'O Proponente, ao optar pelo pagamento do prêmio do seguro especificado na presente proposta, declara estar ciente das condições gerais do produto, do limite de indenização representado pela "importância segurada" e do valor da franquia aplicável por evento reclamado. Declara, ainda, estar ciente que a Cobertura da Apólice é à base de Reclamações com Notificação. Declara, por fim, sua concordância que o seu Certificado de participação na apólice estipulada pela DUOLIFE PLATAFORMA DE NEGÓCIOS seja emitido unicamente na forma digital que será disponibilizado para acesso após a sua emissão.'}
          </p>
        </div>
      </section>

      {/* 4. SEÇÃO CONDIÇÕES DE COMERCIALIZAÇÃO */}
      <section className="w-full">
        {/* Cabeçalho de Seção */}
        <div className="bg-slate-100 border border-slate-300 font-bold px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-slate-900">
          CONDIÇÕES DE COMERCIALIZAÇÃO
        </div>

        {/* Grade de 4 Linhas x 2 Colunas */}
        <div className="border-x border-b border-slate-300 bg-white text-[8px] flex flex-col">
          {/* Linha 1: Importância Segurada & Forma de Pagamento */}
          <div className="flex border-b border-slate-300">
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Importância Segurada:
            </div>
            <div className="flex-1 px-2 py-1 font-bold text-slate-900 border-r border-slate-300 truncate">
              {cImportancia}
            </div>
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Forma de Pagamento:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {cFormaPag}
            </div>
          </div>

          {/* Linha 2: Valor do Prêmio a Pagar & Estipulante */}
          <div className="flex border-b border-slate-300">
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Valor do Prêmio a Pagar:
            </div>
            <div className="flex-1 px-2 py-1 font-bold text-slate-900 border-r border-slate-300 truncate">
              {cPremio}
            </div>
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Estipulante:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {cEstipulante}
            </div>
          </div>

          {/* Linha 3: Vigência do Seguro & Seguradora */}
          <div className="flex border-b border-slate-300">
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Vigência do Seguro:
            </div>
            <div className="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              {cVigencia}
            </div>
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Seguradora:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {cSeguradora}
            </div>
          </div>

          {/* Linha 4: Corretora & Franquia */}
          <div className="flex">
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Corretora:
            </div>
            <div className="flex-1 px-2 py-1 border-r border-slate-300 truncate">
              {cCorretora}
            </div>
            <div className="w-[140px] bg-slate-100 font-bold px-2 py-1 border-r border-slate-300 flex items-center shrink-0">
              Franquia:
            </div>
            <div className="flex-1 px-2 py-1 truncate">
              {cFranquia}
            </div>
          </div>
        </div>
      </section>

      {/* 5. DATA E CIDADE CENTRALIZADOS */}
      <div className="text-center pt-2 pb-1">
        <p className="text-[8px] font-medium text-slate-800 tracking-normal">
          {dataCidadeTexto}
        </p>
      </div>

      {/* 6. BLOCO DE ASSINATURAS (ÂNCORAS ZAPSIGN + LINHAS DE ASSINATURA) */}
      <section className="pt-2 pb-1">
        <div className="grid grid-cols-2 gap-12 px-6">
          {/* Assinatura 1: Corretora (Esquerda) */}
          <div className="flex flex-col items-center text-center">
            {/* Âncora ZapSign: quase imperceptível visualmente, mas legível pelo leitor ZapSign */}
            <span
              className="text-[6.5px] text-slate-200 select-none leading-none mb-1 opacity-60 print:opacity-30"
              aria-hidden="true"
            >
              {"{{assinatura_corretora}}"}
            </span>

            {/* Linha de Assinatura */}
            <div className="w-full border-t border-slate-800 mb-1" />

            {/* Nome e Cargo da Corretora */}
            <p className="text-[8.5px] font-bold text-slate-900 leading-tight truncate w-full">
              {signCorretora}
            </p>
            <p className="text-[7.5px] text-slate-600 leading-tight">
              Corretora
            </p>
          </div>

          {/* Assinatura 2: Proponente (Direita) */}
          <div className="flex flex-col items-center text-center">
            {/* Âncora ZapSign */}
            <span
              className="text-[6.5px] text-slate-200 select-none leading-none mb-1 opacity-60 print:opacity-30"
              aria-hidden="true"
            >
              {"{{assinatura_proponente}}"}
            </span>

            {/* Linha de Assinatura */}
            <div className="w-full border-t border-slate-800 mb-1" />

            {/* Nome e Cargo do Proponente */}
            <p className="text-[8.5px] font-bold text-slate-900 leading-tight truncate w-full">
              {signProponente}
            </p>
            <p className="text-[7.5px] text-slate-600 leading-tight">
              Proponente
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default RcAdvogadoContractTemplate;
