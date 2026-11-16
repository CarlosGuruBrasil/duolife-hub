import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sql } from '@/lib/pg';
import {
  normalizarSimNaoPpe,
  parsePpeCargoIds,
  resolverPpeContrato,
  resolverPpeContratoPadrao,
} from '@/lib/ppe-contrato';
import { renderRcAdvogadoInnerHtml } from '@/lib/gotenberg-contract-generator';
import { CARGOS_PPE_PADRAO } from '@/lib/product-schemas/types';

const wixRow = (id: string, text: string) => ({
  payload: JSON.stringify({ item: { data: { id_: id, text } } }),
});

describe('ppe-contrato — declaração PPE no contrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parsePpeCargoIds', () => {
    it('aceita array, string com vírgulas e descarta o marcador "0"', () => {
      expect(parsePpeCargoIds(['3', '7'])).toEqual(['3', '7']);
      expect(parsePpeCargoIds('3,7')).toEqual(['3', '7']);
      expect(parsePpeCargoIds('3, 7')).toEqual(['3', '7']);
      expect(parsePpeCargoIds('0')).toEqual([]);
      expect(parsePpeCargoIds(['0', '2', '2'])).toEqual(['2']);
      expect(parsePpeCargoIds(undefined)).toEqual([]);
      expect(parsePpeCargoIds('')).toEqual([]);
    });

    it('lê de volta o formato gravado pela edição da proposta (array unido por ", ")', () => {
      // app/api/cotacoes/[id]/route.ts grava ppeCargoSelect como texto; o modal de edição
      // precisa reconstruir a seleção a partir dele ao reabrir a proposta.
      const gravado = ['1', '5'].map(String).join(', ');
      expect(parsePpeCargoIds(gravado)).toEqual(['1', '5']);
    });
  });

  describe('normalizarSimNaoPpe', () => {
    it('usa o primeiro candidato preenchido e assume "Não" por padrão', () => {
      expect(normalizarSimNaoPpe('Sim')).toBe('Sim');
      expect(normalizarSimNaoPpe(true)).toBe('Sim');
      expect(normalizarSimNaoPpe('nao')).toBe('Não');
      expect(normalizarSimNaoPpe(undefined, '', 'Sim')).toBe('Sim');
      expect(normalizarSimNaoPpe(undefined, null)).toBe('Não');
    });
  });

  describe('resolverPpeContrato', () => {
    it('resolve as descrições pelo catálogo Wix PPECARGOS', async () => {
      (sql as any).mockResolvedValueOnce([wixRow('3', 'Membros do STF (Wix)'), wixRow('7', 'Prefeitos (Wix)')]);

      const ppe = await resolverPpeContrato({ ppeCargos: 'Sim', ppeRepresenta: 'Não', ppeCargoSelect: ['7', '3'] });

      expect(ppe).toEqual({
        ppeCargos: 'Sim',
        ppeRepresenta: 'Não',
        cargos: ['Prefeitos (Wix)', 'Membros do STF (Wix)'],
      });
    });

    it('usa o catálogo padrão quando a coleção Wix não está sincronizada ou falha', async () => {
      (sql as any).mockRejectedValueOnce(new Error('relation wix_items does not exist'));

      const ppe = await resolverPpeContrato({ ppeCargos: 'Sim', ppeCargoSelect: '4' });

      expect(ppe.cargos).toEqual([
        'Presidente, vice-presidente e diretor, ou equivalentes, de entidades da administração pública indireta',
      ]);
    });

    it('mantém o valor bruto para IDs desconhecidos', async () => {
      (sql as any).mockResolvedValueOnce([]);

      const ppe = await resolverPpeContrato({ ppeRepresenta: 'Sim', ppeCargoSelect: ['99'] });

      expect(ppe).toEqual({ ppeCargos: 'Não', ppeRepresenta: 'Sim', cargos: ['99'] });
    });

    it('não consulta o banco quando não há declaração afirmativa', async () => {
      const ppe = await resolverPpeContrato({ ppeCargos: 'Não', ppeRepresenta: 'Não', ppeCargoSelect: '0' });

      expect(ppe).toEqual({ ppeCargos: 'Não', ppeRepresenta: 'Não', cargos: [] });
      expect(sql).not.toHaveBeenCalled();
    });

    it('catálogo padrão segue a numeração oficial do Wix (12 cargos)', () => {
      expect(CARGOS_PPE_PADRAO.map((c) => c.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
      // ID 5 no Wix = DAS nível 6 (o modal antigo exibia outro texto para o mesmo ID)
      expect(CARGOS_PPE_PADRAO.find((c) => c.id === '5')?.text).toContain('DAS, nível 6');
      expect(resolverPpeContratoPadrao({ ppeCargos: 'Sim', ppeCargoSelect: '12' }).cargos[0]).toMatch(/^Também são consideradas/);
    });

    it('versão síncrona resolve apenas pelo catálogo padrão', () => {
      expect(resolverPpeContratoPadrao({ ppe: 'Sim', ppeCargoSelect: '1' }).cargos).toEqual([
        'Detentores de mandatos eletivos dos Poderes Executivo e Legislativo da União',
      ]);
    });
  });

  describe('HTML do contrato Gotenberg', () => {
    it('imprime a seção PPE com respostas e cargos declarados (escapados)', () => {
      const html = renderRcAdvogadoInnerHtml({
        proponente: { nome: 'Dr. Teste' },
        ppe: { ppeCargos: 'Sim', ppeRepresenta: 'Não', cargos: ['Prefeitos & Vereadores', '<b>Juiz</b>'] },
      });

      expect(html).toContain('PPE – PESSOA POLITICAMENTE EXPOSTA');
      expect(html).toContain('data-section="ppe"');
      expect(html).toMatch(/nos últimos 5 anos\?\s*<\/div>\s*<div[^>]*>\s*Sim\s*<\/div>/);
      expect(html).toContain('Cargos declarados:');
      expect(html).toContain('Prefeitos &amp; Vereadores');
      expect(html).toContain('&lt;b&gt;Juiz&lt;/b&gt;');
      expect(html).not.toContain('<b>Juiz</b>');
    });

    it('imprime "Não" e omite a linha de cargos quando não há declaração', () => {
      const html = renderRcAdvogadoInnerHtml({ proponente: { nome: 'Dr. Teste' } });

      expect(html).toContain('PPE – PESSOA POLITICAMENTE EXPOSTA');
      expect(html).not.toContain('Cargos declarados:');
    });
  });
});
