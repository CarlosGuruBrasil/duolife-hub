import { dispatchDomainEvent, ensureDefaultTriggers } from '../src/lib/triggers/dispatcher';
import { ensureDefaultEmailTemplates, normalizeEmailVariables, renderTemplateString } from '../src/lib/email-service';
import type { TriggerEvaluationContext } from '../src/lib/triggers/types';

async function main() {
  console.log('--- TESTE: Gatilho PROPOSTA_CRIADA & Template proposta_criada ---');

  // 1. Testa normalização de variáveis com link_assinatura
  const testVars = {
    nome: 'Dra. Roberta Santos',
    cotacao_id: 'test-cotacao-1234',
    produto_nome: 'Seguro Responsabilidade Civil Profissional',
    cobertura: '200.000,00',
    valor: '650,00',
    parceiro_nome: 'Corretora DuoLife Prime',
    link_assinatura: 'https://app.zapsign.com.br/verificar/mock-doc-token',
    documento: '12345678901',
  };

  const norm = normalizeEmailVariables(testVars);
  console.log('1. Variáveis normalizadas:', {
    cliente_nome: norm.cliente_nome,
    link_assinatura: norm.link_assinatura,
    link_proposta: norm.link_proposta,
    documento: norm.documento,
  });

  if (norm.link_assinatura !== testVars.link_assinatura) {
    throw new Error('Falha na normalização de link_assinatura');
  }
  if (norm.documento !== '123.456.789-01') {
    throw new Error('Falha na máscara de documento');
  }

  // 2. Testa renderização de string de template
  const templateSnippet = '<p>Olá {{nome}}, assine aqui: <a href="{{link_assinatura}}">Link</a> CPF: {{documento}}</p>';
  const rendered = renderTemplateString(templateSnippet, testVars, true);
  console.log('2. Renderização de teste:', rendered);

  if (!rendered.includes('Dra. Roberta Santos') || !rendered.includes('mock-doc-token') || !rendered.includes('123.456.789-01')) {
    throw new Error('Falha na renderização de variáveis do template');
  }

  console.log('✅ Todos os testes locais de normalização e template foram aprovados com sucesso!');
}

main().catch((err) => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
