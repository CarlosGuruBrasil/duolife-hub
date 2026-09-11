import { JSDOM } from 'jsdom';
const jsdom = new JSDOM();
(global as any).DOMParser = jsdom.window.DOMParser;
(global as any).window = jsdom.window;

import { syncHtmlToEmailDesign } from '../src/components/admin/EmailVisualEditor/emailHtmlParser';
import { generateEmailHtml } from '../src/components/admin/EmailVisualEditor/emailHtmlGenerator';

const faturaHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7faf9; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .header { background: #0e4a5a; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 32px 24px; line-height: 1.6; }
    .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .btn { display: inline-block; background: #00d4e0; color: #0e4a5a; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; }
    .footer { font-size: 12px; color: #64748b; text-align: center; padding: 20px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">Fatura de Seguro Disponível</h2>
    </div>
    <div class="content">
      <p>Olá, <strong>{{nome|Cliente}}</strong>,</p>
      <p>Seu contrato da proposta <strong>#{{cotacao_id}}</strong> foi assinado com sucesso! A cobrança oficial já foi gerada e está pronta para liquidação.</p>
      <div class="card-info">
        <p style="margin: 4px 0;"><strong>Valor:</strong> R$ {{valor|0,00}}</p>
        <p style="margin: 4px 0;"><strong>Vencimento:</strong> {{vencimento}}</p>
        <p style="margin: 4px 0;"><strong>Opções de Pagamento:</strong> Boleto Bancário e PIX (QRCode)</p>
      </div>
      <p>Clique no botão abaixo para abrir a fatura e efetuar o pagamento:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{link_fatura}}" class="btn" target="_blank">Acessar Boleto / Pagar via PIX</a>
      </div>
      <p style="font-size: 13px; color: #64748b;">Assim que o pagamento for compensado pelo banco, sua cobertura será ativada e a apólice será emitida automaticamente.</p>
      <p style="margin-top: 24px;">Atenciosamente,<br><strong>Equipe DuoLife</strong></p>
    </div>
    <div class="footer">
      DuoLife Hub &bull; {{-ano-}}
    </div>
  </div>
</body>
</html>`;

const design = syncHtmlToEmailDesign(faturaHtml, null);
console.log('--- TESTE 1: PARSING DO TEMPLATE FATURA_GERADA ---');
console.log('Total de Seções:', design.sections.length);

// Seção Header
const header = design.sections[0];
console.log('\n[Header]');
console.log('  Tipo:', header.type);
console.log('  Cor de Fundo:', header.styles.backgroundColor);
console.log('  Border Radius Top Left:', header.styles.borderRadiusTopLeft);
console.log('  Conteúdo do Header:', (header.columns[0].blocks[0].content.data as any).html);
console.log('  Cor do Título:', (header.columns[0].blocks[0].content.data as any).color);

// Seção Content
const content = design.sections[1];
console.log('\n[Content]');
console.log('  Tipo:', content.type);
console.log('  Total de Blocos:', content.columns[0].blocks.length);

const cardBlock = content.columns[0].blocks[1];
console.log('\n  [Card Block (Bloco 1)]');
console.log('    Tipo:', cardBlock.type);
console.log('    Fundo do Card:', cardBlock.styles?.backgroundColor);
console.log('    Borda do Card:', `${cardBlock.styles?.borderWidth}px ${cardBlock.styles?.borderStyle} ${cardBlock.styles?.borderColor}`);
console.log('    Border Radius:', cardBlock.styles?.borderRadius);

const btnBlock = content.columns[0].blocks[3];
console.log('\n  [Button Block (Bloco 3)]');
console.log('    Tipo:', btnBlock.type);
console.log('    Texto:', (btnBlock.content.data as any).text);
console.log('    URL:', (btnBlock.content.data as any).url);
console.log('    Cor do Botão:', (btnBlock.content.data as any).buttonColor);
console.log('    Cor do Texto do Botão:', (btnBlock.content.data as any).textColor);
console.log('    Alinhamento:', (btnBlock.content.data as any).align);
console.log('    Border Radius:', (btnBlock.content.data as any).borderRadius);

// Seção Footer
const footer = design.sections[2];
console.log('\n[Footer]');
console.log('  Tipo:', footer.type);
console.log('  Borda Superior:', `${footer.styles.borderWidth}px ${footer.styles.borderStyle} ${footer.styles.borderColor}`);
console.log('  Cor do Texto do Rodapé:', (footer.columns[0].blocks[0].content.data as any).color);

// TESTE 2: Geração de HTML -> Edição no Código -> Reconciliação de volta
console.log('\n--- TESTE 2: CICLO BIDIRECIONAL (HTML -> VISUAL -> HTML -> VISUAL) ---');
const generatedHtml = generateEmailHtml(design);
console.log('HTML gerado com sucesso. Contém marcadores data-*?', generatedHtml.includes('data-section-id') && generatedHtml.includes('data-button-cell'));

// Simulando alteração no editor de código: mudando a cor do botão de #00d4e0 para #10b981 (verde) e texto
const editedHtml = generatedHtml
  .replace(/#00d4e0/g, '#10b981')
  .replace(/Acessar Boleto \/ Pagar via PIX/g, 'Pagar Fatura com Desconto PIX');

const syncedDesign = syncHtmlToEmailDesign(editedHtml, design);
const syncedBtn = syncedDesign.sections[1].columns[0].blocks[3];
console.log('Após edição no código e retorno ao visual:');
console.log('  Nova Cor do Botão refletida?', (syncedBtn.content.data as any).buttonColor === '#10b981');
console.log('  Novo Texto do Botão refletido?', (syncedBtn.content.data as any).text === 'Pagar Fatura com Desconto PIX');

if ((syncedBtn.content.data as any).buttonColor === '#10b981' && (syncedBtn.content.data as any).text === 'Pagar Fatura com Desconto PIX') {
  console.log('\n>>> SUCESSO TOTAL: SINCRONIZAÇÃO BIDIRECIONAL 100% OPERANTE! <<<');
} else {
  console.error('\n>>> FALHA NA SINCRONIZAÇÃO BIDIRECIONAL <<<');
}
