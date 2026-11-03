import { describe, it, expect } from 'vitest';
import { isSvgSafe } from '@/lib/svg-sanitizer';

describe('Blindagem de Segurança contra XSS em SVG (isSvgSafe)', () => {
  it('deve aprovar SVGs vetoriais legítimos sem scripts', () => {
    const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="green" /></svg>';
    expect(isSvgSafe(validSvg)).toBe(true);
  });

  it('deve rejeitar SVGs contendo tags <script>', () => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    expect(isSvgSafe(maliciousSvg)).toBe(false);
  });

  it('deve rejeitar SVGs contendo manipuladores de eventos on* (onload, onerror, onclick)', () => {
    const xssOnload = '<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'/api/steal\')"><rect width="10" height="10"/></svg>';
    expect(isSvgSafe(xssOnload)).toBe(false);

    const xssOnError = '<svg><image href="x" onerror="alert(document.cookie)" /></svg>';
    expect(isSvgSafe(xssOnError)).toBe(false);
  });

  it('deve rejeitar SVGs contendo javascript: em links ou tags', () => {
    const xssJavascript = '<svg><a href="javascript:alert(1)"><text>Clique</text></a></svg>';
    expect(isSvgSafe(xssJavascript)).toBe(false);
  });

  it('deve rejeitar SVGs contendo <foreignObject>, <iframe> ou <embed>', () => {
    const foreignObject = '<svg><foreignObject width="100" height="50"><div>teste</div></foreignObject></svg>';
    expect(isSvgSafe(foreignObject)).toBe(false);
  });
});
