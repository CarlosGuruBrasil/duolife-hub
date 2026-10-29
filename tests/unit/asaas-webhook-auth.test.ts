import { describe, it, expect } from 'vitest';
import { sanitizeApiToken, verifyWebhookToken } from '@/lib/webhook-auth';

describe('Blindagem de Autenticação de Webhooks (webhook-auth)', () => {
  describe('1. sanitizeApiToken', () => {
    it('deve retornar string vazia para valores nulos, indefinidos ou vazios', () => {
      expect(sanitizeApiToken(null)).toBe('');
      expect(sanitizeApiToken(undefined)).toBe('');
      expect(sanitizeApiToken('')).toBe('');
      expect(sanitizeApiToken('   ')).toBe('');
    });

    it('deve remover espaços e quebras de linha nas extremidades', () => {
      expect(sanitizeApiToken('  token_seguro_123  ')).toBe('token_seguro_123');
      expect(sanitizeApiToken('\n\r token_seguro_123 \n')).toBe('token_seguro_123');
    });

    it('deve remover aspas duplas e simples envolventes acidentais', () => {
      expect(sanitizeApiToken('"token_com_aspas"')).toBe('token_com_aspas');
      expect(sanitizeApiToken("'token_com_aspas_simples'")).toBe('token_com_aspas_simples');
      expect(sanitizeApiToken('  "token_espaco_e_aspas"  ')).toBe('token_espaco_e_aspas');
    });

    it('deve remover prefixo Bearer acidental (case-insensitive)', () => {
      expect(sanitizeApiToken('Bearer token_123')).toBe('token_123');
      expect(sanitizeApiToken('bearer token_456')).toBe('token_456');
      expect(sanitizeApiToken('BEARER token_789')).toBe('token_789');
      expect(sanitizeApiToken('  Bearer  token_com_espacos  ')).toBe('token_com_espacos');
    });
  });

  describe('2. verifyWebhookToken (Resiliência e Segurança)', () => {
    const validSecret = 'asaas_wh_secret_2026_super_seguro_xyz_123';

    it('deve autorizar quando o token recebido for exatamente igual ao configurado', () => {
      expect(verifyWebhookToken(validSecret, validSecret)).toBe(true);
    });

    it('deve autorizar com resiliência quando o token recebido contiver espaços acidentais nas bordas', () => {
      expect(verifyWebhookToken(`  ${validSecret}  `, validSecret)).toBe(true);
      expect(verifyWebhookToken(validSecret, `  ${validSecret}  `)).toBe(true);
    });

    it('deve autorizar com resiliência quando o token recebido contiver aspas acidentais', () => {
      expect(verifyWebhookToken(`"${validSecret}"`, validSecret)).toBe(true);
      expect(verifyWebhookToken(validSecret, `"${validSecret}"`)).toBe(true);
    });

    it('deve autorizar com resiliência quando o token vier com prefixo Bearer acidental', () => {
      expect(verifyWebhookToken(`Bearer ${validSecret}`, validSecret)).toBe(true);
    });

    it('deve rejeitar (fail-closed) quando o segredo configurado for nulo, indefinido ou vazio', () => {
      expect(verifyWebhookToken(validSecret, null)).toBe(false);
      expect(verifyWebhookToken(validSecret, undefined)).toBe(false);
      expect(verifyWebhookToken(validSecret, '')).toBe(false);
      expect(verifyWebhookToken(validSecret, '   ')).toBe(false);
    });

    it('deve rejeitar (fail-closed) quando o cabeçalho recebido for nulo, indefinido ou vazio', () => {
      expect(verifyWebhookToken(null, validSecret)).toBe(false);
      expect(verifyWebhookToken(undefined, validSecret)).toBe(false);
      expect(verifyWebhookToken('', validSecret)).toBe(false);
      expect(verifyWebhookToken('   ', validSecret)).toBe(false);
    });

    it('deve rejeitar quando os tokens forem divergentes', () => {
      expect(verifyWebhookToken('token_errado', validSecret)).toBe(false);
      expect(verifyWebhookToken(validSecret, 'outro_secret')).toBe(false);
    });

    it('deve rejeitar com segurança tokens de comprimentos diferentes sem lançar erro de buffer', () => {
      expect(verifyWebhookToken('curto', validSecret)).toBe(false);
      expect(verifyWebhookToken('a'.repeat(500), validSecret)).toBe(false);
    });
  });

  describe('3. Diagnóstico e Rastreabilidade de Motivos de Falha de Autenticação', () => {
    function resolveUnauthorizedReason(rawAuthHeader: string | null | undefined, secret: string | null | undefined) {
      if (!secret?.trim()) {
        return 'Secret do webhook não configurado no DuoLife Hub (ASAAS_WEBHOOK_SECRET ausente no banco e no ambiente)';
      }
      if (!rawAuthHeader?.trim()) {
        return 'Cabeçalho asaas-access-token ausente na requisição';
      }
      return 'Token do cabeçalho asaas-access-token não confere com o segredo configurado';
    }

    it('deve diagnosticar com clareza quando o secret não estiver configurado no Hub', () => {
      expect(resolveUnauthorizedReason('token_recebido', '')).toContain('Secret do webhook não configurado no DuoLife Hub');
      expect(resolveUnauthorizedReason('token_recebido', null)).toContain('Secret do webhook não configurado no DuoLife Hub');
      expect(resolveUnauthorizedReason('token_recebido', undefined)).toContain('Secret do webhook não configurado no DuoLife Hub');
    });

    it('deve diagnosticar com clareza quando o cabeçalho asaas-access-token não for enviado', () => {
      expect(resolveUnauthorizedReason('', 'meu_secret_123')).toContain('Cabeçalho asaas-access-token ausente na requisição');
      expect(resolveUnauthorizedReason(null, 'meu_secret_123')).toContain('Cabeçalho asaas-access-token ausente na requisição');
      expect(resolveUnauthorizedReason(undefined, 'meu_secret_123')).toContain('Cabeçalho asaas-access-token ausente na requisição');
    });

    it('deve diagnosticar com clareza quando o token enviado for incorreto ou divergente', () => {
      expect(resolveUnauthorizedReason('token_invalido', 'meu_secret_123')).toContain(
        'Token do cabeçalho asaas-access-token não confere com o segredo configurado'
      );
    });
  });
});
