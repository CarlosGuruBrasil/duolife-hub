// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveLocalDraft,
  loadLocalDraft,
  clearLocalDraft,
  getClientSessionToken,
  setClientSessionToken,
  generateClientSessionToken,
} from '@/lib/client-draft-storage';

describe('LocalStorage & Client Session Token (Auto-Save de Contratação)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Gestão de Rascunho Local por Token do Link', () => {
    it('deve salvar e carregar rascunho com sucesso', () => {
      const draft = {
        step: 3,
        form: {
          nome: 'Carlos Santos',
          cpfCnpj: '123.456.789-00',
          email: 'carlos@exemplo.com',
          celular: '(11) 99999-8888',
        },
        planoSel: { id: 'plano-1', nome: 'Plano Prata', cobertura: 'R$ 200.000' } as any,
        parcelaSel: { qtd: 1, valor: 1200 },
        formaPagamento: 'PIX',
      };

      const ok = saveLocalDraft('dlk_test_123', draft);
      expect(ok).toBe(true);

      const loaded = loadLocalDraft('dlk_test_123');
      expect(loaded).not.toBeNull();
      expect(loaded?.step).toBe(3);
      expect(loaded?.form.nome).toBe('Carlos Santos');
      expect(loaded?.form.email).toBe('carlos@exemplo.com');
      expect(loaded?.planoSel?.id).toBe('plano-1');
      expect(loaded?.savedAt).toBeDefined();
    });

    it('deve retornar null se o rascunho não existir', () => {
      const loaded = loadLocalDraft('token_inexistente');
      expect(loaded).toBeNull();
    });

    it('deve limpar rascunho corretamente', () => {
      saveLocalDraft('dlk_test_abc', { step: 2, form: { nome: 'Maria' } as any });
      expect(loadLocalDraft('dlk_test_abc')).not.toBeNull();

      clearLocalDraft('dlk_test_abc');
      expect(loadLocalDraft('dlk_test_abc')).toBeNull();
    });

    it('deve tolerar JSON corrompido sem lançar erro', () => {
      window.localStorage.setItem('duolife_draft_corrupted', '{ invalid json ...');
      const loaded = loadLocalDraft('corrupted');
      expect(loaded).toBeNull();
    });
  });

  describe('Gestão de Token de Sessão Zero-Trust do Cliente', () => {
    it('deve gerar token seguro no formato esperado', () => {
      const token = generateClientSessionToken();
      expect(token).toMatch(/^cst_[a-zA-Z0-9_-]{24,}$/);
    });

    it('deve salvar e recuperar o token de sessão indexado pelo documento normalizado', () => {
      const doc = '123.456.789-00';
      const token = 'cst_test_token_abc_123';

      setClientSessionToken(doc, token);

      const retrieved = getClientSessionToken(doc);
      expect(retrieved).toBe(token);

      // Também deve recuperar informando apenas dígitos
      expect(getClientSessionToken('12345678900')).toBe(token);
    });

    it('deve retornar null para documento sem token prévio', () => {
      expect(getClientSessionToken('99999999999')).toBeNull();
    });
  });
});
