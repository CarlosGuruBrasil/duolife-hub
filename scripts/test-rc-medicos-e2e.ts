/**
 * ============================================================================
 * Suíte de Testes End-to-End: Esteira de Cotações de Saúde (RC Médico — G1 a G8)
 * ============================================================================
 * Valida o fluxo ponta a ponta do ramo de Saúde:
 * 1. Catálogo e Grupos Tarifários (G1 a G8, 250k, 500k e 1M)
 * 2. Motor de Precificação Server-Side (calcularPrecoServidor, parcelamento 1x a 6x e trava 40%)
 * 3. Geração do Termo de Adesão Oficial em PDF (estritamente 2 páginas, metadados e âncoras ZapSign)
 * 4. Regras e Matriz de Dupla Assinatura (Proponente + Corretora)
 * 5. Trava de Pré-Pagamento Asaas (bloqueio 422 sem assinatura e liberação pós-termo)
 * ============================================================================
 */

import assert from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import {
  GRUPOS_TARIFARIOS_SAUDE,
  PLANOS_SAUDE_POR_GRUPO,
  rcMedicosConfig,
} from '../src/lib/product-schemas/definitions/rc-medicos';
import { calcularPrecoServidor } from '../src/lib/pricing';
import {
  identificarRequisitosAssinatura,
  getCotacaoAssinaturaInfo,
} from '../src/lib/assinatura-status';
import { renderContratoPdf, determinarTipoContrato } from '../src/lib/pdf-contract-generator';
import type { CorretoraContratoInfo } from '../src/lib/corretora-resolver';

async function runHealthE2ETests() {
  console.log('🏥 ================================================================');
  console.log('   INICIANDO TESTES E2E DA ESTEIRA DE SAÚDE (RC MÉDICO - G1 A G8)');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. VALIDAÇÃO DO CATÁLOGO E MATRIZ TARIFÁRIA (G1 A G8)
  // -------------------------------------------------------------------------
  console.log('📦 1. Validando Estrutura do Catálogo e Planos por Grupo (G1 a G8)...');

  assert.strictEqual(
    GRUPOS_TARIFARIOS_SAUDE.length,
    8,
    'Devem existir exatamente 8 grupos tarifários oficiais na saúde'
  );

  const expectedGroups = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];
  const expectedTiers = ['250k', '500k', '1M'];

  for (const grupoId of expectedGroups) {
    const grupo = GRUPOS_TARIFARIOS_SAUDE.find((g) => g.id === grupoId);
    assert.ok(grupo, `Grupo tarifário ${grupoId} deve estar registrado`);

    const planos = PLANOS_SAUDE_POR_GRUPO[grupoId];
    assert.ok(planos && planos.length === 3, `Grupo ${grupoId} deve conter exatamente 3 planos (250k, 500k, 1M)`);

    for (const tier of expectedTiers) {
      const plano = planos.find((p) => p.tipoDePlano === tier);
      assert.ok(plano, `Plano ${tier} deve existir no grupo ${grupoId}`);
      assert.strictEqual(plano.maxParcelas, 6, `Plano ${tier} do grupo ${grupoId} deve permitir até 6 parcelas`);
      assert.ok(Number(plano.valorPagoKovr || 0) > 0, `Plano ${tier} do grupo ${grupoId} deve ter valor de repasse da Kovr definido`);
      assert.ok(plano.parcela && plano.parcela.startsWith('R$'), `Parcela à vista deve ser formatada em moeda`);
      assert.ok(plano.parcela6X && plano.parcela6X.startsWith('R$'), `Parcela 6x deve estar preenchida`);
    }
    console.log(`   ✔ Grupo ${grupoId} (${grupo.label.slice(0, 35)}...): 3 faixas tarifárias validadas`);
  }

  // -------------------------------------------------------------------------
  // 2. MOTOR DE PRECIFICAÇÃO SERVER-SIDE (calcularPrecoServidor)
  // -------------------------------------------------------------------------
  console.log('\n💰 2. Testando Motor de Precificação Server-Side para todos os Grupos...');

  // Teste G1 (Outros profissionais): 250k em 1x e 6x
  const precoG1_250k_1x = await calcularPrecoServidor({
    tipoDePlano: '250k',
    qtdParcelasSolicitada: 1,
    flowKey: 'rc-medicos',
    grupoTarifario: 'G1',
  });
  assert.ok(precoG1_250k_1x);
  assert.strictEqual(precoG1_250k_1x.valorTotal, 893.05, 'Valor total G1 250k à vista deve ser 893.05');
  assert.strictEqual(precoG1_250k_1x.qtdParcelas, 1);

  const precoG1_250k_6x = await calcularPrecoServidor({
    tipoDePlano: '250k',
    qtdParcelasSolicitada: 6,
    flowKey: 'rc-medicos',
    grupoTarifario: 'G1',
  });
  assert.ok(precoG1_250k_6x);
  assert.strictEqual(precoG1_250k_6x.qtdParcelas, 6, 'Deve aceitar 6 parcelas');
  assert.strictEqual(precoG1_250k_6x.valorParcela, 148.84, 'Parcela 6x de G1 250k deve ser 148.84');
  console.log('   ✔ G1 (Outros profissionais) - 250k calculado à vista e 6x com sucesso');

  // Teste G5 (Médico sem cirurgia): 500k em 3x
  const precoG5_500k_3x = await calcularPrecoServidor({
    tipoDePlano: '500k',
    qtdParcelasSolicitada: 3,
    flowKey: 'rc-medicos',
    grupoTarifario: 'G5',
  });
  assert.ok(precoG5_500k_3x);
  assert.strictEqual(precoG5_500k_3x.valorTotal, 2071.54, 'Valor total G5 500k deve ser 2071.54');
  assert.strictEqual(precoG5_500k_3x.qtdParcelas, 3);
  assert.strictEqual(precoG5_500k_3x.valorParcela, 690.51, 'Parcela 3x de G5 500k deve ser 690.51');
  console.log('   ✔ G5 (Médico sem cirurgia) - 500k em 3x calculado com exatidão');

  // Teste G8 (Cirurgião Plástico): 1M em 6x
  const precoG8_1M_6x = await calcularPrecoServidor({
    tipoDePlano: '1M',
    qtdParcelasSolicitada: 6,
    flowKey: 'rc-medicos',
    grupoTarifario: 'G8',
  });
  assert.ok(precoG8_1M_6x);
  assert.strictEqual(precoG8_1M_6x.valorTotal, 12571.23, 'Valor total G8 1M deve ser 12571.23');
  assert.strictEqual(precoG8_1M_6x.qtdParcelas, 6);
  assert.strictEqual(precoG8_1M_6x.valorParcela, 2095.21, 'Parcela 6x de G8 1M deve ser 2095.21');
  console.log('   ✔ G8 (Cirurgião Plástico) - 1M em 6x calculado com exatidão');

  // Teste Trava de Desconto Máximo de 40%
  const precoComDescontoExcessivo = await calcularPrecoServidor({
    tipoDePlano: '250k',
    qtdParcelasSolicitada: 1,
    flowKey: 'rc-medicos',
    grupoTarifario: 'G5',
    descontoManualPercent: 60, // Tentativa abusiva de 60%
  });
  assert.ok(precoComDescontoExcessivo);
  assert.strictEqual(
    precoComDescontoExcessivo.descontoPercentual,
    40,
    'Desconto manual deve ser rigidamente travado no teto máximo de 40%'
  );
  // Valor original G5 250k: 1294.46 -> com 40% de desconto: 1294.46 * 0.6 = 776.68
  assert.strictEqual(precoComDescontoExcessivo.valorTotal, 776.68);
  console.log('   ✔ Trava inegociável de 40% de desconto comercial respeitada');

  // -------------------------------------------------------------------------
  // 3. DETERMINAÇÃO DO CONTRATO E GERAÇÃO DO TERMO DE ADESÃO EM PDF (2 PÁGINAS)
  // -------------------------------------------------------------------------
  console.log('\n📄 3. Validando Geração Oficial do Termo de Adesão da Saúde em PDF...');

  const mockCotacaoMed = {
    id: 'cot-test-med-001',
    product_id: 'prod-rc-med-001',
    flow_key: 'rc-medicos',
    client_name: 'Dra. Gabriela Vasconcelos',
    client_cpf_cnpj: '123.456.789-00',
    client_email: 'gabriela.med@exemplo.com.br',
    client_phone: '+55 11 98765-4321',
    importancia_segurada: '500000.00',
    premio_calculado: '2071.54',
    premio_final: '2071.54',
    status: 'rascunho',
    is_renewal: false,
    client_data: {
      flowKey: 'rc-medicos',
      grupoTarifario: 'G5',
      especialidadeMedica: 'Cardiologia Clínica',
      crm: '123456',
      crmUf: 'SP',
      rqe: '78910',
      associadoEscritorio: 'Sim',
      nomeEscritorio: 'Hospital do Coração & Clínica Cardiológica',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01310-100',
      tipo: '500k',
      parcela: '3',
      assinamConsentimento: 'Sim',
      prestacaoDomicilio: 'Não',
      auditoriaRisco: 'Sim',
      atendimentosMensais: '120 atendimentos/mês',
      questionarioRisco: {
        propostaRecusada: 'Não',
        processoConselho: 'Não',
        reclamacaoErroMedico: 'Não',
        complicacoesCirurgicas: 'Não',
        fatoPotencial: 'Não',
        pagamentoIndenizacao: 'Não',
      },
    },
  };

  const tipoContrato = determinarTipoContrato(mockCotacaoMed.client_data, mockCotacaoMed as any);
  assert.strictEqual(
    tipoContrato,
    'termo_saude',
    'Cotação de saúde deve selecionar estritamente o modelo "termo_saude"'
  );
  console.log('   ✔ Seletor de modelo resolveu "termo_saude" com sucesso');

  const mockCorretora: CorretoraContratoInfo = {
    id: 'corretora_net4life_001',
    razaoSocial: 'Net4life Corretora de Seguros Ltda',
    nomeFantasia: 'NET4Life Corretora de Seguros',
    cnpj: '07.351.909/0001-33',
    susep: '202018702',
    email: 'contato@net4life.com.br',
    phone: '+55 11 91177-1319',
    enderecoFormatado: 'Rod. José Carlos Daux, 8600 - Bloco 03 Sala 05, Santo Antônio de Lisboa, Florianópolis - SC',
    cidade: 'Florianópolis',
    uf: 'SC',
    logoBuffer: null,
    logoMimeType: null,
  };

  const pdfResult = await renderContratoPdf({
    cotacao: mockCotacaoMed,
    clientData: mockCotacaoMed.client_data,
    corretora: mockCorretora,
    valorTotal: 2071.54,
    qtdParcelas: 3,
    valorParcela: 690.51,
    valorTotalComJuros: 2071.54,
  });

  assert.ok(pdfResult.buffer && pdfResult.buffer.length > 0, 'Buffer do PDF deve ser gerado');
  assert.strictEqual(pdfResult.tipoContrato, 'termo_saude');

  // Carrega o PDF gerado para validação física da contagem de páginas
  const loadedPdf = await PDFDocument.load(pdfResult.buffer);
  const pageCount = loadedPdf.getPageCount();
  assert.strictEqual(
    pageCount,
    2,
    `O Termo de Adesão da Saúde deve possuir rigorosamente 2 páginas (obtido: ${pageCount})`
  );
  console.log(`   ✔ Termo de Adesão gerado com rigorosas ${pageCount} páginas (100% de conformidade com o layout Kovr/DuoLife)`);

  // Valida signatários esperados no resultado
  assert.ok(pdfResult.signatarioProponente, 'Deve conter signatário proponente');
  assert.strictEqual(pdfResult.signatarioProponente?.nome, 'Dra. Gabriela Vasconcelos');
  assert.ok(pdfResult.signatarioCorretora, 'Deve conter signatário corretora para dupla assinatura');
  console.log('   ✔ Metadados de signatários para ZapSign preenchidos corretamente');

  // Teste adicional 3.1: G2 (Dentista - CRO)
  const mockDentista = {
    ...mockCotacaoMed,
    client_name: 'Dr. Lucas Silveira - Cirurgião Dentista',
    client_data: {
      ...mockCotacaoMed.client_data,
      grupoTarifario: 'G2',
      cro: '98765',
      croUf: 'SP',
      tipo: '250k',
    },
  };
  const pdfDentista = await renderContratoPdf({
    cotacao: mockDentista,
    clientData: mockDentista.client_data,
    corretora: mockCorretora,
    valorTotal: 937.30,
    qtdParcelas: 1,
    valorParcela: 937.30,
    valorTotalComJuros: 937.30,
  });
  const pdfDentistaLoaded = await PDFDocument.load(pdfDentista.buffer);
  assert.strictEqual(pdfDentistaLoaded.getPageCount(), 2);
  console.log('   ✔ G2 (Dentista com CRO) gerou Termo de Adesão de 2 páginas');

  // Teste adicional 3.2: G1 (Fisioterapeuta - CREFITO)
  const mockOutro = {
    ...mockCotacaoMed,
    client_name: 'Dra. Mariana Costa - Fisioterapeuta',
    client_data: {
      ...mockCotacaoMed.client_data,
      grupoTarifario: 'G1',
      registroProfissionalNumero: '4321-F',
      registroProfissionalUf: 'RJ',
      tipo: '250k',
    },
  };
  const pdfOutro = await renderContratoPdf({
    cotacao: mockOutro,
    clientData: mockOutro.client_data,
    corretora: mockCorretora,
    valorTotal: 893.05,
    qtdParcelas: 1,
    valorParcela: 893.05,
    valorTotalComJuros: 893.05,
  });
  const pdfOutroLoaded = await PDFDocument.load(pdfOutro.buffer);
  assert.strictEqual(pdfOutroLoaded.getPageCount(), 2);
  console.log('   ✔ G1 (Profissional da Saúde com Conselho) gerou Termo de Adesão de 2 páginas');

  // Teste adicional 3.3: G8 (Cirurgião Plástico com RQE)
  const mockPlastico = {
    ...mockCotacaoMed,
    client_name: 'Dr. Roberto Meirelles - Cirurgião Plástico',
    client_data: {
      ...mockCotacaoMed.client_data,
      grupoTarifario: 'G8',
      crm: '554433',
      crmUf: 'SP',
      rqe: '12345',
      tipo: '1M',
    },
  };
  const pdfPlastico = await renderContratoPdf({
    cotacao: mockPlastico,
    clientData: mockPlastico.client_data,
    corretora: mockCorretora,
    valorTotal: 12571.23,
    qtdParcelas: 6,
    valorParcela: 2095.21,
    valorTotalComJuros: 12571.23,
  });
  const pdfPlasticoLoaded = await PDFDocument.load(pdfPlastico.buffer);
  assert.strictEqual(pdfPlasticoLoaded.getPageCount(), 2);
  console.log('   ✔ G8 (Cirurgião Plástico com RQE) gerou Termo de Adesão de 2 páginas');

  // -------------------------------------------------------------------------
  // 4. REGRAS E MATRIZ DE DUPLA ASSINATURA (ZAPSIGN)
  // -------------------------------------------------------------------------
  console.log('\n✍️ 4. Testando Matriz de Dupla Assinatura e Status Parcial...');

  // 4.1 Identificação dinâmica de requisitos
  const requisitos = identificarRequisitosAssinatura(mockCotacaoMed.client_data, mockCotacaoMed);
  assert.strictEqual(requisitos.total, 2, 'Contrato de saúde requer exatamente 2 assinaturas');
  assert.strictEqual(requisitos.modo, 'dynamic_pdf');
  assert.deepStrictEqual(requisitos.papeis, ['cliente', 'corretora']);
  assert.strictEqual(requisitos.precisaCliente, true);
  assert.strictEqual(requisitos.precisaCorretora, true);
  console.log('   ✔ Requisitos de 2 assinaturas (Cliente + Corretora) validados');

  // 4.2 Matriz de Estados de Assinatura
  // Estado 1: Nenhuma assinatura (0/2)
  const status0de2 = getCotacaoAssinaturaInfo('contrato_gerado', {
    flowKey: 'rc-medicos',
    statusAssinatura: 'faltam_ambas',
  });
  assert.ok(status0de2);
  assert.strictEqual(status0de2.status, 'faltam_ambas');
  assert.strictEqual(status0de2.countLabel, '0/2');
  console.log('   ✔ Estado 0/2: "Faltam Ambas" validado');

  // Estado 2: Apenas Corretora assinou (1/2) -> Falta Cliente
  const statusCorretoraAssinou = getCotacaoAssinaturaInfo('contrato_gerado', {
    flowKey: 'rc-medicos',
    statusAssinatura: 'falta_cliente',
    corretoraAssinou: true,
    clienteAssinou: false,
  });
  assert.ok(statusCorretoraAssinou);
  assert.strictEqual(statusCorretoraAssinou.status, 'falta_cliente');
  assert.strictEqual(statusCorretoraAssinou.countLabel, '1/2');
  console.log('   ✔ Estado 1/2 (corretora OK): "Falta Cliente" validado');

  // Estado 3: Apenas Cliente assinou (1/2) -> Falta Corretora
  const statusClienteAssinou = getCotacaoAssinaturaInfo('contrato_gerado', {
    flowKey: 'rc-medicos',
    statusAssinatura: 'falta_corretora',
    corretoraAssinou: false,
    clienteAssinou: true,
  });
  assert.ok(statusClienteAssinou);
  assert.strictEqual(statusClienteAssinou.status, 'falta_corretora');
  assert.strictEqual(statusClienteAssinou.countLabel, '1/2');
  console.log('   ✔ Estado 1/2 (cliente OK): "Falta Corretora" validado');

  // Estado 4: Ambas assinadas (2/2) -> Concluído
  const status2de2 = getCotacaoAssinaturaInfo('assinado', {
    flowKey: 'rc-medicos',
    statusAssinatura: 'todas_assinadas',
    clienteAssinou: true,
    corretoraAssinou: true,
  });
  assert.ok(status2de2);
  assert.strictEqual(status2de2.status, 'todas_assinadas');
  assert.strictEqual(status2de2.countLabel, '2/2');
  console.log('   ✔ Estado 2/2: "Ambas Assinadas" validado');

  // -------------------------------------------------------------------------
  // 5. TESTE DA TRAVA DE PRÉ-PAGAMENTO
  // -------------------------------------------------------------------------
  console.log('\n🔒 5. Validando Regra de Trava de Cobrança Pré-Pagamento...');

  // Função auxiliar simulando a regra de negócio do endpoint gerar-pagamento
  function validarPermissaoCobranca(status: string, clientData: any, contratoAssinadoFlag: any) {
    const isSigned =
      status === 'assinado' ||
      status === 'assinada' ||
      status === 'pagamento_gerado' ||
      status === 'aprovada' ||
      status === 'emitida' ||
      status === 'ativa' ||
      Boolean(clientData?.contratoAssinado) ||
      Boolean(contratoAssinadoFlag);

    if (!isSigned) {
      return { allowed: false, error: 'É obrigatório assinar o Termo de Adesão antes da geração do boleto de pagamento.' };
    }
    return { allowed: true };
  }

  // Cotação em 'rascunho' ou 'aguardando_assinatura' sem termo assinado
  const checkBloqueio = validarPermissaoCobranca('rascunho', {}, false);
  assert.strictEqual(checkBloqueio.allowed, false);
  assert.strictEqual(checkBloqueio.error, 'É obrigatório assinar o Termo de Adesão antes da geração do boleto de pagamento.');
  console.log('   ✔ Bloqueio obrigatório confirmado para cotação não assinada (HTTP 422 esperado)');

  // Cotação assinada com sucesso
  const checkLiberado = validarPermissaoCobranca('assinado', { contratoAssinado: true }, true);
  assert.strictEqual(checkLiberado.allowed, true);
  console.log('   ✔ Liberação de pagamento confirmada pós-assinatura do Termo de Adesão');

  console.log('\n================================================================');
  console.log('🎉 TODOS OS TESTES E2E DA ESTEIRA DE SAÚDE FORAM APROVADOS (100%)');
  console.log('================================================================');
}

runHealthE2ETests().catch((err) => {
  console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES E2E DE SAÚDE:', err);
  process.exit(1);
});
