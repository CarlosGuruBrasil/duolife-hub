import { describe, it, expect } from 'vitest';
import {
  calculateLuminance,
  ensureReadableColor,
  generateQrCodeSvg,
  generateQrCodeDataUrl,
  generateDisplayCardSvg,
} from '@/lib/qr-code';

describe('QR Code Library & Visual Identity', () => {
  describe('calculateLuminance', () => {
    it('deve calcular luminância 0 para preto (#000000)', () => {
      const lum = calculateLuminance('#000000');
      expect(lum).toBeCloseTo(0, 4);
    });

    it('deve calcular luminância 1 para branco (#ffffff)', () => {
      const lum = calculateLuminance('#ffffff');
      expect(lum).toBeCloseTo(1, 4);
    });

    it('deve calcular luminância intermediária para cores escuras', () => {
      const lumClassic = calculateLuminance('#0e4a5a');
      expect(lumClassic).toBeLessThan(0.45);
      expect(lumClassic).toBeGreaterThan(0.02);
    });
  });

  describe('ensureReadableColor', () => {
    it('deve manter cores escuras que possuem excelente contraste', () => {
      expect(ensureReadableColor('#0e4a5a')).toBe('#0e4a5a');
      expect(ensureReadableColor('#064e3b')).toBe('#064e3b');
      expect(ensureReadableColor('#1e3a8a')).toBe('#1e3a8a');
      expect(ensureReadableColor('#18181b')).toBe('#18181b');
    });

    it('deve substituir cores muito claras (luminância > 0.45) pelo fallback de contraste', () => {
      // Amarelo claro e ciano elétrico puro
      const resultYellow = ensureReadableColor('#ffff00', '#0e4a5a');
      expect(resultYellow).toBe('#0e4a5a');

      const resultWhite = ensureReadableColor('#ffffff', '#0e4a5a');
      expect(resultWhite).toBe('#0e4a5a');
    });

    it('deve aplicar fallback para valores nulos, vazios ou hex inválidos', () => {
      expect(ensureReadableColor(null)).toBe('#0e4a5a');
      expect(ensureReadableColor(undefined)).toBe('#0e4a5a');
      expect(ensureReadableColor('invalid-color')).toBe('#0e4a5a');
      expect(ensureReadableColor('#123')).toBe('#0e4a5a');
    });
  });

  describe('generateQrCodeSvg', () => {
    it('deve gerar string SVG vetorial válida para uma URL', async () => {
      const svg = await generateQrCodeSvg('https://duolife.com.br/contratar/dlk_test123', {
        color: '#0e4a5a',
        width: 300,
      });

      expect(typeof svg).toBe('string');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('viewBox');
      expect(svg.toLowerCase()).toContain('#0e4a5a');
    });
  });

  describe('generateQrCodeDataUrl', () => {
    it('deve gerar Data URL base64 com prefixo PNG', async () => {
      const dataUrl = await generateQrCodeDataUrl('https://duolife.com.br/contratar/dlk_test123', {
        color: '#0e4a5a',
        width: 512,
      });

      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(dataUrl.length).toBeGreaterThan(100);
    });
  });

  describe('generateDisplayCardSvg', () => {
    it('deve gerar placa de balcão (Display Card) com dados da corretora e instruções', async () => {
      const cardSvg = await generateDisplayCardSvg({
        url: 'https://duolife.com.br/contratar/dlk_test123',
        companyName: 'Seguros Alpha LTDA',
        companySlogan: 'Protegendo seu patrimônio',
        companyPhone: '11 99999-8888',
        companyEmail: 'atendimento@alpha.com.br',
        primaryColor: '#0e4a5a',
        accentColor: '#00d4e0',
        label: 'RC Profissional Advogados',
        discountPercent: 15,
        sellerName: 'Carlos Souza',
      });

      expect(typeof cardSvg).toBe('string');
      expect(cardSvg).toContain('<svg');
      expect(cardSvg).toContain('Seguros Alpha LTDA');
      expect(cardSvg).toContain('Protegendo seu patrimônio');
      expect(cardSvg).toContain('-15% OFF EXCLUSIVO');
      expect(cardSvg).toContain('RC Profissional Advogados');
      expect(cardSvg).toContain('Consultor(a): Carlos Souza');
      expect(cardSvg).toContain('Aponte a câmera do seu celular');
      expect(cardSvg).toContain('PARCERIA OFICIAL DUOLIFE');
    });

    it('deve lidar com dados parciais ou ausentes de forma elegante', async () => {
      const cardSvg = await generateDisplayCardSvg({
        url: 'https://duolife.com.br/contratar/dlk_test456',
        companyName: 'Corretora Sem Slogan',
      });

      expect(cardSvg).toContain('Corretora Sem Slogan');
      expect(cardSvg).toContain('CONDIÇÕES ESPECIAIS');
      expect(cardSvg).toContain('PARCERIA OFICIAL DUOLIFE');
    });
  });
});
