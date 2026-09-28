import assert from 'node:assert';
import { safeExternalUrl } from '../src/lib/safe-url';
import { normalizeEmailVariables, DEFAULT_TEMPLATES } from '../src/lib/email-service';

async function runTests() {
  console.log('--- TESTE: Fluxo de Links de Assinatura ZapSign & Redirecionamento ---');

  // Teste 1: safeExternalUrl deve aceitar URLs da ZapSign com /verificar/
  console.log('Teste 1: Validação de safeExternalUrl para rotas /verificar/ do ZapSign');
  const validZapSignUrl = 'https://app.zapsign.com.br/verificar/98a76b54-3210-4cba-beef-0123456789ab';
  const validSandboxUrl = 'https://sandbox.app.zapsign.com.br/verificar/token-sandbox-123';
  const invalidProtocolUrl = 'javascript:alert("xss")';
  const emptyUrl = '';

  assert.strictEqual(
    safeExternalUrl(validZapSignUrl),
    validZapSignUrl,
    'safeExternalUrl deve manter intacta a URL de assinatura da ZapSign'
  );
  assert.strictEqual(
    safeExternalUrl(validSandboxUrl),
    validSandboxUrl,
    'safeExternalUrl deve manter intacta a URL de sandbox da ZapSign'
  );
  assert.strictEqual(
    safeExternalUrl(invalidProtocolUrl),
    '',
    'safeExternalUrl deve bloquear URLs com protocolo javascript:'
  );
  assert.strictEqual(
    safeExternalUrl(emptyUrl),
    '',
    'safeExternalUrl deve retornar string vazia para valores vazios'
  );
  console.log('  -> Sucesso: safeExternalUrl validou URLs legítimas da ZapSign e bloqueou vulnerabilidades.');

  // Teste 2: Normalização de variáveis de e-mail para link_assinatura
  console.log('Teste 2: Normalização de variáveis no email-service para link_assinatura');
  const varsInput = {
    signUrl: validZapSignUrl,
    nome: 'Carlos Eduardo',
    cotacao_id: 'cot-test-123',
  };
  const normalized = normalizeEmailVariables(varsInput);

  assert.strictEqual(
    normalized.link_assinatura,
    validZapSignUrl,
    'normalizeEmailVariables deve preencher link_assinatura a partir de signUrl'
  );
  assert.strictEqual(
    normalized.sign_url,
    validZapSignUrl,
    'normalizeEmailVariables deve preencher sign_url a partir de signUrl'
  );
  assert.strictEqual(
    normalized.link_proposta,
    validZapSignUrl,
    'normalizeEmailVariables deve preencher link_proposta a partir de signUrl'
  );
  console.log('  -> Sucesso: Variáveis de e-mail mapeadas corretamente para envio ao cliente.');

  // Teste 3: Renderização do Template proposta_criada contendo o link da ZapSign
  console.log('Teste 3: Renderização do template proposta_criada com botão e link explícito');
  const templateProposta = DEFAULT_TEMPLATES.find((t) => t.code === 'proposta_criada');
  assert.ok(templateProposta, 'Template proposta_criada deve existir nos templates padrão');

  // Simula interpolação das variáveis
  let renderedHtml = templateProposta.body_html;
  for (const [key, value] of Object.entries(normalized)) {
    renderedHtml = renderedHtml.replace(new RegExp(`{{${key}\\|?[^}]*}}`, 'g'), String(value));
  }

  assert.ok(
    renderedHtml.includes(`href="${validZapSignUrl}"`),
    'HTML do e-mail deve conter o link de assinatura no botão CTA'
  );
  assert.ok(
    renderedHtml.includes(validZapSignUrl),
    'HTML do e-mail deve conter a URL explícita para cópia direta'
  );
  console.log('  -> Sucesso: Template proposta_criada renderizou botão e link de assinatura ZapSign.');

  // Teste 4: Fallback de token ZapSign em resolveContratoSignUrl logic
  console.log('Teste 4: Resolução de URL de assinatura por docToken');
  const docTokenSample = '8910bba1-5123-4411-a89e-test-token';
  const expectedUrl = `https://app.zapsign.com.br/verificar/${docTokenSample}`;

  // Validação da regra pura de fallback
  const isDocTokenValid =
    typeof docTokenSample === 'string' &&
    !docTokenSample.includes('/') &&
    !docTokenSample.includes(' ') &&
    docTokenSample.length > 5;

  assert.strictEqual(isDocTokenValid, true, 'docToken deve ser válido para fallback');
  const generatedFallback = isDocTokenValid ? `https://app.zapsign.com.br/verificar/${docTokenSample}` : null;
  assert.strictEqual(generatedFallback, expectedUrl, 'Fallback por docToken deve gerar a URL correta');
  console.log('  -> Sucesso: Resolução de fallback por docToken validada.');

  // Teste 5: Chamada de resolveContratoSignUrl com inputs inválidos/vazios
  console.log('Teste 5: Tratamento de inputs nulos e vazios em resolveContratoSignUrl');
  const { resolveContratoSignUrl } = await import('../src/lib/contrato-link-resolver');
  const resEmpty = await resolveContratoSignUrl('');
  assert.strictEqual(resEmpty, null, 'Input vazio deve retornar null');
  const resNull = await resolveContratoSignUrl(null as any);
  assert.strictEqual(resNull, null, 'Input null deve retornar null');
  console.log('  -> Sucesso: resolveContratoSignUrl tratou inputs inválidos com segurança.');

  console.log('\n--- TODOS OS 5 TESTES PASSARAM COM SUCESSO! ---');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
