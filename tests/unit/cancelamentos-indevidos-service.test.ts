import { describe, it, expect } from 'vitest';
import {
  listarCanceladosIndevidos,
  reativarCobrancaFaltante,
  LISTA_NOMES_AFETADOS_OFICIAL,
} from '@/lib/cancelamentos-indevidos-service';

describe('Serviço de Cancelamentos Indevidos e Reativação', () => {
  it('deve conter a lista oficial dos 36 segurados afetados', () => {
    expect(LISTA_NOMES_AFETADOS_OFICIAL).toHaveLength(36);
    expect(LISTA_NOMES_AFETADOS_OFICIAL).toContain('Antonio Clovis Garcia');
    expect(LISTA_NOMES_AFETADOS_OFICIAL).toContain('MONIA KITIANE TONIAL');
    expect(LISTA_NOMES_AFETADOS_OFICIAL).toContain('Rafael de Jesus da Silva');
  });

  it('deve exportar as funções principais com tipagem correta', () => {
    expect(typeof listarCanceladosIndevidos).toBe('function');
    expect(typeof reativarCobrancaFaltante).toBe('function');
  });

  it('deve validar parâmetros e retornar erro se cotacaoId for vazio', async () => {
    const res = await reativarCobrancaFaltante({ cotacaoId: '' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('ID da cotação não informado');
  });
});
