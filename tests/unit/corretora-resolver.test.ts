import { describe, it, expect } from 'vitest';
import {
  isNet4LifeCorretora,
  formatCnpj,
  formatPhone,
} from '@/lib/corretora-resolver';

/**
 * Função de decisão do ecossistema que resolve se a emissão do contrato deve usar
 * o Template padrão ZapSign (exclusivo Net4Life) ou PDF Dinâmico com dados da corretora parceira.
 * (Espelhada em server actions e rotas de geração de documentos do DuoLife Hub).
 */
export function resolverModoContrato(
  corretora: {
    id?: string | null;
    cnpj?: string | null;
    nomeFantasia?: string | null;
    razaoSocial?: string | null;
  } | null | undefined,
  docGenerationMode: 'template' | 'dynamic_pdf',
  isMedico = false
): { isDynamicPdf: boolean; modo: 'template' | 'dynamic_pdf' } {
  const isNet = isNet4LifeCorretora(corretora);
  // Regra Inegociável: Apenas Net4Life pode utilizar o template do ZapSign.
  // Outras corretoras parceiras são estritamente forçadas a PDF Dinâmico para inclusão correta de CNPJ, SUSEP e Logo.
  const isDynamicPdf = !isNet || isMedico || docGenerationMode === 'dynamic_pdf';
  return {
    isDynamicPdf,
    modo: isDynamicPdf ? 'dynamic_pdf' : 'template',
  };
}

describe('corretora-resolver.test.ts - Identificação de Corretoras e Resolução de Modo de Contrato', () => {
  const net4lifeMaster = {
    id: 'corretora_net4life_001',
    cnpj: '07.351.909/0001-33',
    nomeFantasia: 'NET4LIFE CORRETORA',
    razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
  };

  const net4lifeDefault = {
    id: 'default',
    cnpj: '34.567.890/0001-12',
    nomeFantasia: 'NET4LIFE',
    razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
  };

  const outraCorretora1 = {
    id: 'corretora_parceira_alpha',
    cnpj: '12.345.678/0001-90',
    nomeFantasia: 'Alpha Corretora de Seguros',
    razaoSocial: 'Alpha Seguros Ltda',
  };

  const outraCorretora2 = {
    id: 'corretora_beta_456',
    cnpj: '98.765.432/0001-10',
    nomeFantasia: 'Beta Brokers',
    razaoSocial: 'Beta Corretagem S/A',
  };

  describe('isNet4LifeCorretora', () => {
    it('deve identificar Net4Life Master por ID e CNPJ', () => {
      expect(isNet4LifeCorretora(net4lifeMaster)).toBe(true);
    });

    it('deve identificar Net4Life Default (fallback padrão)', () => {
      expect(isNet4LifeCorretora(net4lifeDefault)).toBe(true);
    });

    it('deve identificar Net4Life por correspondência no nome', () => {
      expect(isNet4LifeCorretora({ nomeFantasia: 'Net4Life Hub' })).toBe(true);
      expect(isNet4LifeCorretora({ razaoSocial: 'Netforlife Corretora' })).toBe(true);
    });

    it('deve retornar false para corretoras parceiras terceiras', () => {
      expect(isNet4LifeCorretora(outraCorretora1)).toBe(false);
      expect(isNet4LifeCorretora(outraCorretora2)).toBe(false);
    });

    it('deve retornar false para valores nulos ou vazios', () => {
      expect(isNet4LifeCorretora(null)).toBe(false);
      expect(isNet4LifeCorretora(undefined)).toBe(false);
      expect(isNet4LifeCorretora({})).toBe(false);
    });
  });

  describe('Regra de Decisão de Modo de Contrato (Template ZapSign vs PDF Dinâmico)', () => {
    it('Caso 1: Net4Life com modo template configurado deve utilizar template ZapSign', () => {
      const res = resolverModoContrato(net4lifeMaster, 'template');
      expect(res.isDynamicPdf).toBe(false);
      expect(res.modo).toBe('template');
    });

    it('Caso 2: Net4Life com modo dynamic_pdf configurado deve utilizar dynamic_pdf', () => {
      const res = resolverModoContrato(net4lifeMaster, 'dynamic_pdf');
      expect(res.isDynamicPdf).toBe(true);
      expect(res.modo).toBe('dynamic_pdf');
    });

    it('Caso 3: Corretora parceira com modo template configurado DEVE ser forçada a dynamic_pdf', () => {
      const res = resolverModoContrato(outraCorretora1, 'template');
      expect(res.isDynamicPdf).toBe(true);
      expect(res.modo).toBe('dynamic_pdf');
    });

    it('Caso 4: Corretora parceira com modo dynamic_pdf configurado utiliza dynamic_pdf', () => {
      const res = resolverModoContrato(outraCorretora2, 'dynamic_pdf');
      expect(res.isDynamicPdf).toBe(true);
      expect(res.modo).toBe('dynamic_pdf');
    });

    it('Caso 5: Ramo médico (isMedico = true) deve forçar dynamic_pdf mesmo para Net4Life', () => {
      const res = resolverModoContrato(net4lifeMaster, 'template', true);
      expect(res.isDynamicPdf).toBe(true);
      expect(res.modo).toBe('dynamic_pdf');
    });
  });

  describe('Funções de Formatação (formatCnpj, formatPhone)', () => {
    it('formatCnpj deve formatar 14 dígitos numéricos para padrão CNPJ', () => {
      expect(formatCnpj('07351909000133')).toBe('07.351.909/0001-33');
      expect(formatCnpj('12345678000190')).toBe('12.345.678/0001-90');
    });

    it('formatCnpj deve preservar formatos já com pontuação ou valores nulos', () => {
      expect(formatCnpj('07.351.909/0001-33')).toBe('07.351.909/0001-33');
      expect(formatCnpj('')).toBe('');
      expect(formatCnpj(null)).toBe('');
    });

    it('formatPhone deve formatar celular (11 dígitos) e fixo (10 dígitos)', () => {
      expect(formatPhone('48991394912')).toBe('(48) 99139-4912');
      expect(formatPhone('4833334444')).toBe('(48) 3333-4444');
    });

    it('formatPhone deve retornar string vazia para valores nulos ou vazios', () => {
      expect(formatPhone('')).toBe('');
      expect(formatPhone(null)).toBe('');
    });
  });
});
