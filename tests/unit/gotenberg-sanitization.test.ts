import { describe, it, expect } from 'vitest';
import { escapeHtml, renderRcAdvogadoInnerHtml } from '@/lib/gotenberg-contract-generator';

describe('Sanitização HTML do Gotenberg (escapeHtml)', () => {
  it('deve escapar caracteres perigosos como <, >, &, ", \'', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escapeHtml('Silva & Souza Advogados')).toBe('Silva &amp; Souza Advogados');
    expect(escapeHtml("Dr. O'Connor")).toBe('Dr. O&#39;Connor');
  });

  it('deve escapar dados de proponente maliciosos no HTML gerado', () => {
    const html = renderRcAdvogadoInnerHtml({
      proponente: {
        nome: 'Dr. Hacker <script>alert(1)</script>',
        cpf: '123.456.789-00',
        email: 'hacker@test.com <img src=x onerror=alert(2)>',
        celular: '11999999999',
        endereco: 'Rua das Flores, 100 & Cia',
        inicioProfissional: '2020',
        oab: '12345/SP',
        dataNascimento: '01/01/1990',
      },
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('Rua das Flores, 100 &amp; Cia');
  });
});
