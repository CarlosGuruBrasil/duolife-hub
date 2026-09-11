import { JSDOM } from 'jsdom';
// Configurar ambiente DOM global no Node.js para os testes
const jsdomInstance = new JSDOM();
(global as any).DOMParser = jsdomInstance.window.DOMParser;
(global as any).window = jsdomInstance.window;

import { generateEmailHtml } from '../src/components/admin/EmailVisualEditor/emailHtmlGenerator';
import { syncHtmlToEmailDesign } from '../src/components/admin/EmailVisualEditor/emailHtmlParser';
import { createBlankDesign } from '../src/components/admin/EmailVisualEditor/defaultTemplates';
import type { TextBlockContent, ButtonBlockContent } from '../src/components/admin/EmailVisualEditor/types';

console.log('--- Iniciando Testes de Sincronizacao Bidirecional de Templates de E-mail ---');

// 1. Criar Design Base
const initialDesign = createBlankDesign();
console.log('1. Design inicial criado com', initialDesign.sections.length, 'secoes.');

// 2. Gerar HTML com marcadores semanticos
const generatedHtml = generateEmailHtml(initialDesign);
console.log('2. HTML gerado com sucesso. Contem marcadores data-block-id?', generatedHtml.includes('data-block-id'));
console.log('   Contem data-section-id?', generatedHtml.includes('data-section-id'));

if (!generatedHtml.includes('data-block-id') || !generatedHtml.includes('data-section-id')) {
  throw new Error('FALHA: O HTML gerado nao contem os marcadores semanticos data-* esperados.');
}

// 3. Simular edicao no Editor de Codigo (Split-View): Trocar a cor de um texto para #ef4444 e mudar seu texto
const textBlock = initialDesign.sections[1].columns[0].blocks.find((b) => b.type === 'text');
if (!textBlock) throw new Error('Bloco de texto nao encontrado no template base.');

const originalBlockId = textBlock.id;
console.log('3. Bloco de texto alvo:', originalBlockId);

const modifiedHtml = generatedHtml.replace(
  'color: #0e4a5a; font-size: 18px;',
  'color: #ef4444; font-size: 18px;'
).replace(
  /\{\{nome\|Cliente\}\}/,
  'Dr. Carlos Eduardo de Souza (Atualizado via Codigo)'
);

// 4. Executar syncHtmlToEmailDesign
console.log('4. Executando syncHtmlToEmailDesign com o HTML modificado...');
const reconciledDesign = syncHtmlToEmailDesign(modifiedHtml, initialDesign);

// 5. Validar se o bloco no design reconciliado capturou a nova cor e o novo texto
const updatedBlock = reconciledDesign.sections[1].columns[0].blocks.find((b) => b.id === originalBlockId);
if (!updatedBlock) {
  throw new Error('FALHA: Bloco original nao foi encontrado no design reconciliado.');
}

const updatedData = updatedBlock.content.data as TextBlockContent;
console.log('   Texto reconciliado:', updatedData.html);
console.log('   Cor reconciliada:', updatedData.color);

const textMatch = updatedData.html.includes('Dr. Carlos Eduardo de Souza (Atualizado via Codigo)');
const colorMatch = updatedData.color === '#ef4444' || updatedData.html.includes('#ef4444');

if (!textMatch) {
  throw new Error('FALHA: O texto editado no codigo nao foi refletido no design!');
}
if (!colorMatch) {
  throw new Error(`FALHA: A nova cor #ef4444 nao foi capturada no design! (Valor obtido: ${updatedData.color})`);
}

console.log('✅ SUCESSO: A troca de cor e de texto no codigo foi perfeitamente refletida no design visual!');

// 6. Testar alteracao de botao (cor de fundo e link)
const buttonBlock = initialDesign.sections[1].columns[0].blocks.find((b) => b.type === 'button');
if (buttonBlock) {
  const btnId = buttonBlock.id;
  const htmlWithBtnChange = modifiedHtml.replaceAll(
    '#0e4a5a',
    '#10b981'
  ).replace(
    'Visualizar Detalhes',
    'Acessar Proposta Imediatamente'
  );

  const designWithBtn = syncHtmlToEmailDesign(htmlWithBtnChange, reconciledDesign);
  const updatedBtn = designWithBtn.sections[1].columns[0].blocks.find((b) => b.id === btnId);
  const btnData = updatedBtn?.content.data as ButtonBlockContent;

  console.log('   Texto do botao reconciliado:', btnData.text);
  console.log('   Cor do botao reconciliada:', btnData.buttonColor);

  if (btnData.text !== 'Acessar Proposta Imediatamente') {
    throw new Error('FALHA: O texto do botao nao foi atualizado no design!');
  }
  if (btnData.buttonColor !== '#10b981') {
    throw new Error(`FALHA: A cor do botao #10b981 nao foi atualizada! (Valor: ${btnData.buttonColor})`);
  }
  console.log('✅ SUCESSO: A alteracao de botao no codigo foi refletida no design visual!');
}

// 7. Testar HTML puro legado sem design_json
console.log('7. Testando HTML puro legado sem design_json previo...');
const legacyRawHtml = `
<!DOCTYPE html>
<html>
<head><title>Email Legado</title></head>
<body style="background-color: #f1f5f9;">
  <table class="email-container" style="max-width: 600px; background-color: #ffffff;">
    <tr>
      <td style="padding: 20px;">
        <h1 style="color: #0f172a;">Aviso Importante</h1>
        <p style="color: #475569; font-size: 16px;">Sua apolice foi emitida com sucesso.</p>
        <p><a href="https://duolife.com.br" style="background-color: #0284c7; color: #ffffff; padding: 10px 20px; text-decoration: none;">Ver Apolice</a></p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const legacyDesign = syncHtmlToEmailDesign(legacyRawHtml, null);
console.log('   Secoes criadas para template legado:', legacyDesign.sections.length);
console.log('   Blocos na primeira secao:', legacyDesign.sections[0]?.columns[0]?.blocks?.length);

if (legacyDesign.sections.length === 0 || legacyDesign.sections[0]?.columns[0]?.blocks?.length === 0) {
  throw new Error('FALHA: O template legado nao foi convertido em secoes e blocos!');
}
console.log('✅ SUCESSO: Template legado em HTML puro convertido com sucesso para o Editor Visual sem resetar!');

console.log('\n🎉 TODOS OS TESTES DE SINCRONIZACAO BIDIRECIONAL PASSARAM COM 100% DE SUCESSO! 🎉');
