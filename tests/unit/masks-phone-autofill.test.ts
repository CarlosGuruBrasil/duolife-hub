import { describe, it, expect } from 'vitest';
import { maskPhone } from '@/components/modals/masks';

describe('Máscara de Telefone com Suporte a Autofill Mobile (maskPhone)', () => {
  it('deve formatar número normal de 11 dígitos com nono dígito', () => {
    expect(maskPhone('47996486081')).toBe('(47) 99648-6081');
  });

  it('deve formatar número fixo de 10 dígitos', () => {
    expect(maskPhone('4734331234')).toBe('(47) 3433-1234');
  });

  it('deve remover prefixo internacional +55 e 55 em números de 12 e 13 dígitos sem truncar os dígitos finais', () => {
    expect(maskPhone('+5547996486081')).toBe('(47) 99648-6081');
    expect(maskPhone('5547996486081')).toBe('(47) 99648-6081');
    expect(maskPhone('+554734331234')).toBe('(47) 3433-1234');
    expect(maskPhone('554734331234')).toBe('(47) 3433-1234');
  });

  it('deve lidar com valores vazios ou nulos', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
    expect(maskPhone(undefined)).toBe('');
  });
});
