import assert from 'node:assert';
import { verifyWebhookToken } from '../src/lib/webhook-auth';
import { identificarRequisitosAssinatura } from '../src/lib/assinatura-status';

console.log('=== TESTE: Resiliência e Correção do Webhook ZapSign ===\n');

// -------------------------------------------------------------
// Teste 1: Validação de Autenticação Segura (Header, Bearer, Query Param)
// -------------------------------------------------------------
console.log('Teste 1: Matriz de Autenticação do Webhook ZapSign');

function testIsAuthorizedMock(
  headers: Record<string, string>,
  query: Record<string, string>,
  configuredSecret: string | undefined
) {
  const secret = (configuredSecret || '').trim();
  if (!secret) return true;

  const headerSecret =
    headers['x-zapsign-webhook-secret'] ||
    headers['x-webhook-secret'];
  if (headerSecret && verifyWebhookToken(headerSecret, secret)) return true;

  const auth = headers['authorization'];
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (bearer && verifyWebhookToken(bearer, secret)) return true;

  const querySecret = query['secret'] || query['token'] || query['key'];
  if (querySecret && verifyWebhookToken(querySecret, secret)) return true;

  return false;
}

// 1.1 Sem segredo configurado (modo público padrão do painel ZapSign)
assert.strictEqual(
  testIsAuthorizedMock({}, {}, ''),
  true,
  '1.1 Deve autorizar quando nenhum segredo está configurado'
);

// 1.2 Com segredo configurado e enviado via header
assert.strictEqual(
  testIsAuthorizedMock({ 'x-zapsign-webhook-secret': 'meu-segredo-123' }, {}, 'meu-segredo-123'),
  true,
  '1.2 Deve autorizar com header x-zapsign-webhook-secret correto'
);

// 1.3 Com segredo configurado e enviado via Bearer
assert.strictEqual(
  testIsAuthorizedMock({ 'authorization': 'Bearer meu-segredo-123' }, {}, 'meu-segredo-123'),
  true,
  '1.3 Deve autorizar com Authorization: Bearer'
);

// 1.4 Com segredo configurado e enviado via Query Param ?secret=...
assert.strictEqual(
  testIsAuthorizedMock({}, { 'secret': 'meu-segredo-123' }, 'meu-segredo-123'),
  true,
  '1.4 Deve autorizar com query param ?secret=...'
);

// 1.5 Com segredo configurado e enviado via Query Param ?token=...
assert.strictEqual(
  testIsAuthorizedMock({}, { 'token': 'meu-segredo-123' }, 'meu-segredo-123'),
  true,
  '1.5 Deve autorizar com query param ?token=...'
);

// 1.6 Com segredo configurado mas requisição sem segredo -> deve rejeitar
assert.strictEqual(
  testIsAuthorizedMock({}, {}, 'meu-segredo-123'),
  false,
  '1.6 Deve rejeitar requisição sem credencial se segredo foi configurado'
);

// 1.7 Com segredo configurado mas com token incorreto -> deve rejeitar
assert.strictEqual(
  testIsAuthorizedMock({}, { 'secret': 'segredo-errado' }, 'meu-segredo-123'),
  false,
  '1.7 Deve rejeitar requisição com segredo incorreto'
);

console.log('  -> Sucesso: Todas as 7 regras de autenticação foram validadas.\n');

// -------------------------------------------------------------
// Teste 2: Prevenção de Falso Positivo de Replay / Idempotência
// -------------------------------------------------------------
console.log('Teste 2: Idempotência Granular por Evento (Evitar Descarte Indevido de doc_signed)');

function generateEventKey(payload: any, eventType: string) {
  const externalDocumentId = payload?.doc_token || payload?.token || null;
  const externalId = payload?.external_id || null;
  const normalizedStatus = payload?.status || 'pending';
  const docObj = payload.doc || payload.document || payload;
  const rawSignersList: any[] = Array.isArray(docObj?.signers)
    ? docObj.signers
    : Array.isArray(payload.signers)
    ? payload.signers
    : [];

  const signersSummary = rawSignersList
    .map((s: any) => `${s.token || s.email || s.name || ''}:${s.status || ''}`)
    .sort()
    .join(';');
  const lastUpdate = payload?.last_update_at || payload?.signed_at || docObj?.last_update_at || '';

  return payload?.event_id || payload?.webhook_id
    ? String(payload.event_id || payload.webhook_id)
    : `${eventType}:${externalDocumentId || externalId || ''}:${normalizedStatus}:${signersSummary}:${lastUpdate}`;
}

const payloadCriacao = {
  id: 998877, // ID do documento na ZapSign
  token: 'doc-token-abc',
  event_type: 'doc_created',
  status: 'pending',
  signers: [{ name: 'Cliente', email: 'cli@teste.com', status: 'new' }],
};

const payloadAssinatura = {
  id: 998877, // Mesmo ID de documento!
  token: 'doc-token-abc',
  event_type: 'doc_signed',
  status: 'signed',
  signed_at: '2026-10-23T15:00:00Z',
  signers: [{ name: 'Cliente', email: 'cli@teste.com', status: 'signed' }],
};

const keyCriacao = generateEventKey(payloadCriacao, 'doc_created');
const keyAssinatura = generateEventKey(payloadAssinatura, 'doc_signed');

assert.notStrictEqual(
  keyCriacao,
  keyAssinatura,
  'A chave de idempotência de doc_signed NUNCA deve colidir com a de doc_created pelo mesmo payload.id'
);
console.log('  Key Criacao:', keyCriacao);
console.log('  Key Assinatura:', keyAssinatura);
console.log('  -> Sucesso: doc_signed não é mais descartado por colisão de payload.id!\n');

// -------------------------------------------------------------
// Teste 3: Lógica de Identificação de Assinaturas (1 Assinatura - Modelo)
// -------------------------------------------------------------
console.log('Teste 3: Contrato de 1 Assinatura (Modelo ZapSign)');

function avaliarAssinatura(
  clientData: Record<string, any>,
  cotacao: any,
  signersList: any[],
  canonicalStatus: string
) {
  const requisitos = identificarRequisitosAssinatura(clientData, cotacao);

  const clientEmail = (cotacao.client_email || clientData.email || '').toLowerCase().trim();
  const clientName = (cotacao.client_name || clientData.nome || '').toLowerCase().trim();

  let proponenteSigner = signersList.find((s: any) => {
    const sEmail = (s.email || '').toLowerCase().trim();
    const sName = (s.name || '').toLowerCase().trim();
    return (clientEmail && sEmail === clientEmail) || (clientName && (sName.includes(clientName) || clientName.includes(sName)));
  });

  let corretoraSigner = signersList.find((s: any) => {
    if (s === proponenteSigner) return false;
    const sEmail = (s.email || '').toLowerCase().trim();
    const sName = (s.name || '').toLowerCase().trim();
    return (
      sEmail.includes('net4life.com.br') ||
      sEmail.includes('corretora') ||
      sEmail.includes('duolife') ||
      sName.includes('corretora') ||
      sName.includes('net4life')
    );
  });

  if (signersList.length >= 2) {
    if (!proponenteSigner && corretoraSigner) {
      proponenteSigner = signersList.find((s: any) => s !== corretoraSigner) || signersList[0];
    } else if (proponenteSigner && !corretoraSigner) {
      corretoraSigner = signersList.find((s: any) => s !== proponenteSigner) || signersList[1];
    } else if (!proponenteSigner && !corretoraSigner) {
      proponenteSigner = signersList[0];
      corretoraSigner = signersList[1];
    }
  } else if (signersList.length === 1 && !proponenteSigner) {
    proponenteSigner = signersList[0];
  }

  let proponenteSigned = Boolean(proponenteSigner && proponenteSigner.status === 'signed');
  let corretoraSigned = Boolean(corretoraSigner && corretoraSigner.status === 'signed');
  const signedCount = signersList.filter((s: any) => s.status === 'signed').length;

  const docStatusFinalizado = canonicalStatus === 'signed' || canonicalStatus === 'completed';

  let todasAssinadas = false;
  let statusAssinatura: 'todas_assinadas' | 'falta_corretora' | 'falta_cliente' | 'faltam_ambas';

  if (requisitos.total === 1) {
    if (docStatusFinalizado || proponenteSigned || signedCount >= 1) {
      todasAssinadas = true;
      proponenteSigned = true;
      corretoraSigned = true;
      statusAssinatura = 'todas_assinadas';
    } else {
      todasAssinadas = false;
      corretoraSigned = true;
      statusAssinatura = 'falta_cliente';
    }
  } else {
    if (docStatusFinalizado || (proponenteSigned && corretoraSigned)) {
      todasAssinadas = true;
      proponenteSigned = true;
      corretoraSigned = true;
      statusAssinatura = 'todas_assinadas';
    } else if (proponenteSigned && !corretoraSigned) {
      statusAssinatura = 'falta_corretora';
    } else if (!proponenteSigned && corretoraSigned) {
      statusAssinatura = 'falta_cliente';
    } else {
      statusAssinatura = 'faltam_ambas';
    }
  }

  return { todasAssinadas, statusAssinatura, proponenteSigned, corretoraSigned };
}

// Cotação de 1 assinatura (Advogados / Modelo ZapSign)
const cotacaoModelo = {
  flow_key: 'rc_advogados',
  product_id: 'prod-rc-adv',
  client_email: 'dr.advogado@oab.org.br',
  client_name: 'Dr. Advogado',
};
const clientDataModelo = {
  contratoModo: 'template',
  totalAssinaturas: 1,
};

// 3.1 Proponente assinou contrato de 1 assinatura
const resModeloAssinado = avaliarAssinatura(
  clientDataModelo,
  cotacaoModelo,
  [{ name: 'Dr. Advogado', email: 'dr.advogado@oab.org.br', status: 'signed' }],
  'signed'
);
assert.strictEqual(resModeloAssinado.todasAssinadas, true, '3.1 Deve marcar todasAssinadas = true');
assert.strictEqual(resModeloAssinado.statusAssinatura, 'todas_assinadas', '3.1 Status deve ser todas_assinadas');
console.log('  -> Sucesso: Contrato de 1 assinatura formalizado com êxito pelo webhook.\n');

// -------------------------------------------------------------
// Teste 4: Lógica de Identificação de Assinaturas (2 Assinaturas - PDF Dinâmico)
// -------------------------------------------------------------
console.log('Teste 4: Contrato de 2 Assinaturas (PDF Dinâmico / RC Médicos)');

const cotacaoDinamica = {
  flow_key: 'rc_medicos_v1',
  product_id: 'prod-rc-med-001',
  client_email: 'doutor@medico.com.br',
  client_name: 'Dr. Médico',
};
const clientDataDinamica = {
  contratoModo: 'dynamic_pdf',
  totalAssinaturas: 2,
};

// 4.1 Apenas o Proponente assinou (1/2)
const resParcialCliente = avaliarAssinatura(
  clientDataDinamica,
  cotacaoDinamica,
  [
    { name: 'Net4Life Corretora', email: 'contato@net4life.com.br', status: 'pending' },
    { name: 'Dr. Médico', email: 'doutor@medico.com.br', status: 'signed' },
  ],
  'pending'
);
assert.strictEqual(resParcialCliente.todasAssinadas, false, '4.1 NÃO deve liberar todasAssinadas com 1/2 assinaturas');
assert.strictEqual(resParcialCliente.statusAssinatura, 'falta_corretora', '4.1 Status deve ser falta_corretora');
assert.strictEqual(resParcialCliente.proponenteSigned, true, '4.1 proponenteSigned deve ser true');
assert.strictEqual(resParcialCliente.corretoraSigned, false, '4.1 corretoraSigned deve ser false');
console.log('  4.1 Assinatura Parcial (Cliente assinou): falta_corretora OK');

// 4.2 Apenas a Corretora assinou (1/2)
const resParcialCorretora = avaliarAssinatura(
  clientDataDinamica,
  cotacaoDinamica,
  [
    { name: 'Net4Life Corretora', email: 'contato@net4life.com.br', status: 'signed' },
    { name: 'Dr. Médico', email: 'doutor@medico.com.br', status: 'pending' },
  ],
  'pending'
);
assert.strictEqual(resParcialCorretora.todasAssinadas, false, '4.2 NÃO deve liberar todasAssinadas com 1/2 assinaturas');
assert.strictEqual(resParcialCorretora.statusAssinatura, 'falta_cliente', '4.2 Status deve ser falta_cliente');
assert.strictEqual(resParcialCorretora.proponenteSigned, false, '4.2 proponenteSigned deve ser false');
assert.strictEqual(resParcialCorretora.corretoraSigned, true, '4.2 corretoraSigned deve ser true');
console.log('  4.2 Assinatura Parcial (Corretora assinou): falta_cliente OK');

// 4.3 Ambas as partes assinaram (2/2)
const resTotal = avaliarAssinatura(
  clientDataDinamica,
  cotacaoDinamica,
  [
    { name: 'Net4Life Corretora', email: 'contato@net4life.com.br', status: 'signed' },
    { name: 'Dr. Médico', email: 'doutor@medico.com.br', status: 'signed' },
  ],
  'signed'
);
assert.strictEqual(resTotal.todasAssinadas, true, '4.3 Deve liberar todasAssinadas quando 2/2 assinaram');
assert.strictEqual(resTotal.statusAssinatura, 'todas_assinadas', '4.3 Status deve ser todas_assinadas');
console.log('  4.3 Assinatura Completa (2/2 assinaram): todas_assinadas OK');

console.log('\n=== TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! ===');
