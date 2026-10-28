import { describe, it, expect } from 'vitest';
import {
  validarCpf,
  validarCnpj,
  somenteDigitos,
  formatarCpf,
  formatarCnpj,
  formatarDocumento,
} from '@/lib/documento';
import { cleanDigits, maskCpfCnpj, maskCnpj } from '@/components/modals/masks';

describe('documento.ts - Validação e Formatação de Documentos Brasileiros (CPF e CNPJ)', () => {
  describe('1. Validação de CPF (validarCpf)', () => {
    it('deve validar CPFs válidos com e sem pontuação', () => {
      const validCpfs = [
        '52998224725',
        '529.982.247-25',
        '01234567890',
        '012.345.678-90',
        '12345678909',
        '123.456.789-09',
        '98765432100',
        '987.654.321-00',
        '21748291009',
        '217.482.910-09',
      ];

      for (const cpf of validCpfs) {
        expect(validarCpf(cpf)).toBe(true);
      }
    });

    it('deve rejeitar sequências de dígitos repetidos conhecidas', () => {
      const repeatedCpfs = [
        '000.000.000-00',
        '111.111.111-11',
        '222.222.222-22',
        '333.333.333-33',
        '444.444.444-44',
        '555.555.555-55',
        '666.666.666-66',
        '777.777.777-77',
        '888.888.888-88',
        '999.999.999-99',
        '00000000000',
        '11111111111',
        '22222222222',
        '33333333333',
        '44444444444',
        '55555555555',
        '66666666666',
        '77777777777',
        '88888888888',
        '99999999999',
      ];

      for (const cpf of repeatedCpfs) {
        expect(validarCpf(cpf)).toBe(false);
      }
    });

    it('deve rejeitar CPFs com dígitos verificadores incorretos', () => {
      const invalidCpfs = [
        '529.982.247-00',
        '529.982.247-24',
        '012.345.678-99',
        '123.456.789-00',
        '987.654.321-01',
        '217.482.910-08',
      ];

      for (const cpf of invalidCpfs) {
        expect(validarCpf(cpf)).toBe(false);
      }
    });

    it('deve rejeitar CPFs com tamanho incorreto ou caracteres não numéricos', () => {
      const invalidLength = [
        '',
        '1',
        '123',
        '123456789',
        '1234567890',
        '123456789012',
        'abc.def.ghi-jk',
      ];

      for (const val of invalidLength) {
        expect(validarCpf(val)).toBe(false);
      }
    });
  });

  describe('2. Validação de CNPJ (validarCnpj)', () => {
    it('deve validar CNPJs válidos com e sem pontuação', () => {
      const validCnpjs = [
        '11.222.333/0001-81',
        '11222333000181',
        '00.000.000/0001-91', // Banco do Brasil
        '00000000000191',
        '06.990.590/0001-23', // Google Brasil
        '06990590000123',
      ];

      for (const cnpj of validCnpjs) {
        expect(validarCnpj(cnpj)).toBe(true);
      }
    });

    it('deve rejeitar sequências de dígitos repetidos em CNPJ', () => {
      const repeatedCnpjs = [
        '00.000.000/0000-00',
        '11.111.111/1111-11',
        '22.222.222/2222-22',
        '33.333.333/3333-33',
        '44.444.444/4444-44',
        '55.555.555/5555-55',
        '66.666.666/6666-66',
        '77.777.777/7777-77',
        '88.888.888/8888-88',
        '99.999.999/9999-99',
      ];

      for (const cnpj of repeatedCnpjs) {
        expect(validarCnpj(cnpj)).toBe(false);
      }
    });

    it('deve rejeitar CNPJs com dígitos verificadores inválidos', () => {
      const invalidCnpjs = [
        '11.222.333/0001-82',
        '00.000.000/0001-92',
        '06.990.590/0001-24',
        '12.345.678/0001-00',
      ];

      for (const cnpj of invalidCnpjs) {
        expect(validarCnpj(cnpj)).toBe(false);
      }
    });

    it('deve rejeitar CNPJs com tamanho incorreto ou vazios', () => {
      const invalid = [
        '',
        '1122233300018',
        '112223330001819',
        'cnpj-invalido',
      ];

      for (const val of invalid) {
        expect(validarCnpj(val)).toBe(false);
      }
    });
  });

  describe('3. Sanitização de pontuação (somenteDigitos e cleanDigits)', () => {
    it('deve extrair estritamente os numerais de strings formatadas', () => {
      expect(somenteDigitos('529.982.247-25')).toBe('52998224725');
      expect(somenteDigitos('11.222.333/0001-81')).toBe('11222333000181');
      expect(somenteDigitos('Texto com 123 e pontuações: .-/ ')).toBe('123');
      expect(somenteDigitos('')).toBe('');
      expect(somenteDigitos('sem_numeros')).toBe('');
    });

    it('cleanDigits deve suportar valores nulos, vazios ou indefinidos com segurança', () => {
      expect(cleanDigits(null)).toBe('');
      expect(cleanDigits(undefined)).toBe('');
      expect(cleanDigits(' (47) 99999-8888 ')).toBe('47999998888');
    });
  });

  describe('4. Formatação de CPF e CNPJ (formatarCpf, formatarCnpj, formatarDocumento)', () => {
    it('formatarCpf deve formatar 11 dígitos no padrão XXX.XXX.XXX-XX', () => {
      expect(formatarCpf('52998224725')).toBe('529.982.247-25');
      expect(formatarCpf('529.982.247-25')).toBe('529.982.247-25');
      expect(formatarCpf(' 529 982 247 25 ')).toBe('529.982.247-25');
    });

    it('formatarCpf deve preservar entrada inválida ou vazia', () => {
      expect(formatarCpf('')).toBe('');
      expect(formatarCpf(null)).toBe('');
      expect(formatarCpf(undefined)).toBe('');
      expect(formatarCpf('123')).toBe('123');
    });

    it('formatarCnpj deve formatar 14 dígitos no padrão XX.XXX.XXX/XXXX-XX', () => {
      expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
      expect(formatarCnpj('11.222.333/0001-81')).toBe('11.222.333/0001-81');
      expect(formatarCnpj(' 11 222 333 0001 81 ')).toBe('11.222.333/0001-81');
    });

    it('formatarCnpj deve preservar entrada inválida ou vazia', () => {
      expect(formatarCnpj('')).toBe('');
      expect(formatarCnpj(null)).toBe('');
      expect(formatarCnpj(undefined)).toBe('');
      expect(formatarCnpj('12345')).toBe('12345');
    });

    it('formatarDocumento deve detectar automaticamente CPF (11) ou CNPJ (14)', () => {
      expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
      expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
      expect(formatarDocumento('outra-coisa')).toBe('outra-coisa');
      expect(formatarDocumento('')).toBe('');
    });
  });

  describe('5. Máscaras dinâmicas de interface (masks.ts)', () => {
    it('maskCpfCnpj deve aplicar máscara progressiva em CPF', () => {
      expect(maskCpfCnpj('5')).toBe('5');
      expect(maskCpfCnpj('529')).toBe('529');
      expect(maskCpfCnpj('5299')).toBe('529.9');
      expect(maskCpfCnpj('5299822')).toBe('529.982.2');
      expect(maskCpfCnpj('52998224725')).toBe('529.982.247-25');
    });

    it('maskCpfCnpj deve expandir dinamicamente para CNPJ a partir do 12º dígito', () => {
      expect(maskCpfCnpj('112223330001')).toBe('11.222.333/0001');
      expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
    });

    it('maskCnpj deve aplicar máscara exclusiva de CNPJ', () => {
      expect(maskCnpj('11222333000181')).toBe('11.222.333/0001-81');
      expect(maskCnpj('')).toBe('');
    });
  });
});
