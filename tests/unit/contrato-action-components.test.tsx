import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ModalAssinaturasContrato, resolverSignatariosContrato } from '@/components/modals/ModalAssinaturasContrato';
import { ContratoActionButton, hasMultiplasAssinaturas } from '@/components/cotacoes/ContratoActionButton';

describe('ModalAssinaturasContrato Component', () => {
  it('não deve renderizar nada quando isOpen for false', () => {
    const html = renderToString(
      <ModalAssinaturasContrato
        isOpen={false}
        onClose={() => {}}
        cotacaoId="cot-123"
        clienteNome="Carlos Silva"
      />
    );
    expect(html).toBe('');
  });

  it('deve renderizar acessibilidade WAI-ARIA quando isOpen for true', () => {
    const html = renderToString(
      <ModalAssinaturasContrato
        isOpen={true}
        onClose={() => {}}
        cotacaoId="cot-123"
        clienteNome="Carlos Silva"
        produtoNome="RC Médico Essencial"
        clienteDocumento="123.456.789-00"
        clienteEmail="carlos@exemplo.com"
        clienteSignUrl="https://app.zapsign.com.br/verificar/xyz"
        corretoraNome="Net4Life Corretora"
        corretoraSignUrl="https://app.zapsign.com.br/verificar/abc"
        totalAssinaturas={2}
        statusAssinatura="faltam_ambas"
      />
    );

    // WAI-ARIA
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="modal-assinaturas-title"');

    // Cabeçalho e Conteúdo
    expect(html).toContain('Assinaturas do Contrato');
    expect(html).toContain('Carlos Silva');
    expect(html).toContain('RC Médico Essencial');
    expect(html).toContain('0 de 2 assinadas');

    // Signatários
    expect(html).toContain('Cliente / Proponente');
    expect(html).toContain('Net4Life Corretora');
    expect(html).toContain('Corretora (Estipulante Coletiva)');
    expect(html).toContain('Pendente');
    expect(html).toContain('Copiar Link');
    expect(html).toContain('Abrir Assinatura');

    // Design System Light Mode
    expect(html).toContain('bg-white');
    expect(html).toContain('border-gray-200');
    expect(html).toContain('text-gray-900');

    // Botões com área de toque mínima em mobile (44px)
    expect(html).toContain('min-h-[44px]');
  });

  it('deve renderizar status assinado quando cliente já tiver assinado (1 de 2)', () => {
    const html = renderToString(
      <ModalAssinaturasContrato
        isOpen={true}
        onClose={() => {}}
        cotacaoId="cot-456"
        clienteNome="Dra. Juliana Medeiros"
        clienteAssinado={true}
        clienteAssinadoEm="29/10/2026 às 10:30"
        corretoraNome="Net4Life Corretora"
        corretoraSignUrl="https://app.zapsign.com.br/verificar/corretora"
        totalAssinaturas={2}
        statusAssinatura="falta_corretora"
      />
    );

    expect(html).toContain('1 de 2 assinadas');
    expect(html).toContain('Assinado');
    expect(html).toContain('29/10/2026');
    expect(html).toContain('bg-emerald-50 text-emerald-800 border border-emerald-200');
    expect(html).toContain('Pendente');
  });

  it('deve renderizar array customizado de signatarios quando fornecido', () => {
    const html = renderToString(
      <ModalAssinaturasContrato
        isOpen={true}
        onClose={() => {}}
        cotacaoId="cot-789"
        signatarios={[
          {
            id: 'sig-1',
            papel: 'cliente',
            tituloPapel: 'Titular',
            nome: 'João Souza',
            assinado: true,
          },
          {
            id: 'sig-2',
            papel: 'outro',
            tituloPapel: 'Testemunha 1',
            nome: 'Maria Fernandes',
            assinado: false,
            signUrl: 'https://zapsign.com.br/testemunha',
          },
        ]}
      />
    );

    expect(html).toContain('1 de 2 assinadas');
    expect(html).toContain('João Souza');
    expect(html).toContain('Maria Fernandes');
    expect(html).toContain('Testemunha 1');
  });
});

describe('ContratoActionButton Component', () => {
  it('deve renderizar botão 📄 Contrato quando isContratoAssinado for true', () => {
    const html = renderToString(
      <ContratoActionButton
        cotacaoId="cot-100"
        isContratoAssinado={true}
        variant="table"
      />
    );

    expect(html).toContain('📄 Contrato');
    expect(html).toContain('/api/cotacoes/cot-100/contrato-pdf?download=true');
    expect(html).toContain('text-emerald-700 bg-emerald-50');
  });

  it('deve renderizar botão ✍️ Contrato com badge de múltiplas assinaturas quando pendente', () => {
    const html = renderToString(
      <ContratoActionButton
        cotacaoId="cot-200"
        status="contrato_gerado"
        totalAssinaturas={2}
        statusAssinatura="faltam_ambas"
        signUrl="https://app.zapsign.com.br/verificar/123"
        signUrlCorretora="https://app.zapsign.com.br/verificar/456"
        variant="table"
      />
    );

    expect(html).toContain('✍️ Contrato');
    expect(html).toContain('0/2');
    expect(html).toContain('text-purple-700 bg-purple-50');
  });

  it('deve renderizar variante card corretamente', () => {
    const html = renderToString(
      <ContratoActionButton
        cotacaoId="cot-300"
        isContratoAssinado={true}
        variant="card"
      />
    );

    expect(html).toContain('Baixar Contrato Assinado (PDF)');
    expect(html).toContain('min-h-[44px]');
  });
});

describe('hasMultiplasAssinaturas helper', () => {
  it('identifica corretamente quando há 2 ou mais assinaturas', () => {
    expect(hasMultiplasAssinaturas({ totalAssinaturas: 2 })).toBe(true);
    expect(hasMultiplasAssinaturas({ signUrlCorretora: 'https://zapsign.com.br/corretora' })).toBe(true);
    expect(hasMultiplasAssinaturas({ statusAssinatura: 'faltam_ambas' })).toBe(true);
    expect(hasMultiplasAssinaturas({ statusAssinatura: 'falta_corretora' })).toBe(true);
    expect(hasMultiplasAssinaturas({ statusAssinatura: 'falta_cliente' })).toBe(true);
    expect(hasMultiplasAssinaturas({ signatariosCount: 3 })).toBe(true);
  });

  it('identifica quando há apenas 1 assinatura', () => {
    expect(hasMultiplasAssinaturas({ totalAssinaturas: 1 })).toBe(false);
    expect(hasMultiplasAssinaturas({ totalAssinaturas: 1, statusAssinatura: 'todas_assinadas' })).toBe(false);
    expect(hasMultiplasAssinaturas({})).toBe(false);
  });
});

describe('resolverSignatariosContrato helper', () => {
  it('resolve cliente e corretora em contratos de 2 assinaturas', () => {
    const res = resolverSignatariosContrato({
      clienteNome: 'Carlos Proponente',
      clienteEmail: 'carlos@teste.com',
      clienteSignUrl: 'https://app.zapsign.com.br/verificar/cli',
      corretoraNome: 'Net4Life Corretora',
      corretoraSignUrl: 'https://app.zapsign.com.br/verificar/corr',
      totalAssinaturas: 2,
      statusAssinatura: 'falta_corretora',
    });

    expect(res).toHaveLength(2);
    expect(res[0].nome).toBe('Carlos Proponente');
    expect(res[0].papel).toBe('cliente');
    expect(res[0].assinado).toBe(true); // falta_corretora => proponente assinou
    expect(res[0].signUrl).toBe('https://app.zapsign.com.br/verificar/cli');

    expect(res[1].nome).toBe('Net4Life Corretora');
    expect(res[1].papel).toBe('corretora');
    expect(res[1].assinado).toBe(false);
    expect(res[1].signUrl).toBe('https://app.zapsign.com.br/verificar/corr');
  });

  it('resolve cliente único em contratos de 1 assinatura', () => {
    const res = resolverSignatariosContrato({
      clienteNome: 'Maria Advogada',
      clienteSignUrl: 'https://app.zapsign.com.br/verificar/adv',
      totalAssinaturas: 1,
      statusAssinatura: 'falta_cliente',
    });

    expect(res).toHaveLength(1);
    expect(res[0].nome).toBe('Maria Advogada');
    expect(res[0].assinado).toBe(false);
  });
});
