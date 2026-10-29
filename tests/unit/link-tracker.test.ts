import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks para módulos externos
vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  sqlMock.unsafe = vi.fn();
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sql } from '@/lib/pg';
import { logger } from '@/lib/logger';
import {
  hashClientIp,
  extractClientAccessData,
  trackSaleLinkAccess,
  calculateConversionMetrics,
} from '@/lib/link-tracker';

describe('Motor de Rastreamento de Links (src/lib/link-tracker.ts)', () => {
  const mockSql = sql as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. hashClientIp', () => {
    it('deve retornar hash SHA-256 determinístico de 64 caracteres hexadecimais', () => {
      const ip = '189.100.45.22';
      const hash = hashClientIp(ip);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('nunca deve retornar o IP em texto claro dentro do hash', () => {
      const ip = '201.55.88.99';
      const hash = hashClientIp(ip);

      expect(hash).not.toContain(ip);
      expect(hash).not.toContain('201.55');
    });

    it('deve produzir hashes idênticos para IPs idênticos (determinismo)', () => {
      const ip = '177.136.200.10';
      const hash1 = hashClientIp(ip);
      const hash2 = hashClientIp(ip);

      expect(hash1).toBe(hash2);
    });

    it('deve produzir hashes distintos para IPs diferentes', () => {
      const hash1 = hashClientIp('192.168.1.1');
      const hash2 = hashClientIp('192.168.1.2');

      expect(hash1).not.toBe(hash2);
    });

    it('deve respeitar salt customizado quando fornecido', () => {
      const ip = '10.0.0.1';
      const hashDefault = hashClientIp(ip);
      const hashCustomSalt = hashClientIp(ip, 'custom_secret_salt_123');

      expect(hashCustomSalt).toHaveLength(64);
      expect(hashCustomSalt).not.toBe(hashDefault);
    });

    it('deve suportar endereços IPv6', () => {
      const ipv6 = '2804:14d:5c82:8970::1001';
      const hash = hashClientIp(ipv6);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).not.toContain(ipv6);
    });
  });

  describe('2. extractClientAccessData', () => {
    it('deve priorizar cf-connecting-ip (Cloudflare) sobre outros headers', () => {
      const headers = {
        'cf-connecting-ip': '203.0.113.10',
        'x-real-ip': '198.51.100.20',
        'x-forwarded-for': '192.0.2.30, 10.0.0.1',
        'true-client-ip': '198.51.100.99',
        'user-agent': 'Mozilla/5.0 Test Browser',
        referer: 'https://google.com',
      };

      const result = extractClientAccessData(headers);
      expect(result.ip).toBe('203.0.113.10');
      expect(result.userAgent).toBe('Mozilla/5.0 Test Browser');
      expect(result.referer).toBe('https://google.com');
    });

    it('deve usar x-real-ip quando cf-connecting-ip não existir', () => {
      const headers = {
        'x-real-ip': '198.51.100.20',
        'x-forwarded-for': '192.0.2.30',
        'user-agent': 'Chrome/120',
      };

      const result = extractClientAccessData(headers);
      expect(result.ip).toBe('198.51.100.20');
      expect(result.userAgent).toBe('Chrome/120');
      expect(result.referer).toBeNull();
    });

    it('deve extrair o primeiro IP antes da vírgula de x-forwarded-for', () => {
      const headers = {
        'x-forwarded-for': '  203.0.113.55 , 10.0.0.1, 172.16.0.1 ',
        referer: 'https://instagram.com',
      };

      const result = extractClientAccessData(headers);
      expect(result.ip).toBe('203.0.113.55');
      expect(result.userAgent).toBeNull();
      expect(result.referer).toBe('https://instagram.com');
    });

    it('deve usar true-client-ip quando os prioritários anteriores não existirem', () => {
      const headers = {
        'true-client-ip': '198.51.100.77',
      };

      const result = extractClientAccessData(headers);
      expect(result.ip).toBe('198.51.100.77');
    });

    it('deve retornar fallback seguro se nenhum header de IP existir', () => {
      const headers = {};

      const result = extractClientAccessData(headers);
      expect(result.ip).toBe('127.0.0.1');
      expect(result.userAgent).toBeNull();
      expect(result.referer).toBeNull();
    });

    it('deve funcionar com instância Fetch Headers (case-insensitive)', () => {
      const headers = new Headers();
      headers.set('CF-Connecting-IP', '177.100.200.5');
      headers.set('User-Agent', 'Safari/17.0');
      headers.set('Referer', 'https://linkedin.com');

      const result = extractClientAccessData(headers);
      expect(result.ip).toBe('177.100.200.5');
      expect(result.userAgent).toBe('Safari/17.0');
      expect(result.referer).toBe('https://linkedin.com');
    });
  });

  describe('3. trackSaleLinkAccess', () => {
    const defaultParams = {
      linkId: 'link-uuid-123',
      token: 'dlk_promo_net4life',
      partnerId: 'partner-uuid-456',
      ip: '189.45.67.89',
      userAgent: 'Mozilla/5.0 Agent',
      referer: 'https://whatsapp.com',
    };

    it('quando visitor com NOVO ip_hash acessa o link, deve incrementar views_count E unique_views_count', async () => {
      // 1. SELECT de verificação: não encontra nenhum acesso anterior para este (link_id, ip_hash)
      mockSql.mockResolvedValueOnce([]); // existingAccess = []
      // 2. INSERT em sale_link_access_logs
      mockSql.mockResolvedValueOnce([{ id: 'log-1' }]);
      // 3. UPDATE em public_sale_links incrementando ambos os contadores
      mockSql.mockResolvedValueOnce([{ id: defaultParams.linkId }]);

      const result = await trackSaleLinkAccess(defaultParams);

      expect(result).toEqual({ tracked: true, isUnique: true });
      expect(mockSql).toHaveBeenCalledTimes(3);

      // Validação das chamadas SQL
      const calls = mockSql.mock.calls;
      const selectQuery = calls[0][0].join(' ');
      expect(selectQuery).toContain('FROM sale_link_access_logs');
      expect(selectQuery).toContain('link_id');
      expect(selectQuery).toContain('ip_hash');

      const insertQuery = calls[1][0].join(' ');
      expect(insertQuery).toContain('INSERT INTO sale_link_access_logs');

      const updateQuery = calls[2][0].join(' ');
      expect(updateQuery).toContain('UPDATE public_sale_links');
      expect(updateQuery).toContain('views_count = views_count + 1');
      expect(updateQuery).toContain('unique_views_count = unique_views_count + 1');
      expect(updateQuery).toContain('last_accessed_at = NOW()');
    });

    it('quando visitor com ip_hash REPETIDO acessa o link, deve incrementar APENAS views_count', async () => {
      // 1. SELECT de verificação: encontra acesso anterior para este (link_id, ip_hash)
      mockSql.mockResolvedValueOnce([{ id: 'existing-log-id' }]); // existingAccess tem registro
      // 2. INSERT em sale_link_access_logs
      mockSql.mockResolvedValueOnce([{ id: 'log-2' }]);
      // 3. UPDATE em public_sale_links incrementando apenas views_count
      mockSql.mockResolvedValueOnce([{ id: defaultParams.linkId }]);

      const result = await trackSaleLinkAccess(defaultParams);

      expect(result).toEqual({ tracked: true, isUnique: false });
      expect(mockSql).toHaveBeenCalledTimes(3);

      const updateQuery = mockSql.mock.calls[2][0].join(' ');
      expect(updateQuery).toContain('UPDATE public_sale_links');
      expect(updateQuery).toContain('views_count = views_count + 1');
      expect(updateQuery).not.toContain('unique_views_count = unique_views_count + 1');
      expect(updateQuery).toContain('last_accessed_at = NOW()');
    });

    it('deve usar fallback seguro de IP caso não seja fornecido nos parâmetros', async () => {
      mockSql.mockResolvedValueOnce([]);
      mockSql.mockResolvedValueOnce([{ id: 'log-3' }]);
      mockSql.mockResolvedValueOnce([{ id: 'link-uuid-no-ip' }]);

      const result = await trackSaleLinkAccess({
        linkId: 'link-uuid-no-ip',
        token: 'dlk_sem_ip',
        partnerId: 'partner-uuid-456',
      });

      expect(result.tracked).toBe(true);
      expect(result.isUnique).toBe(true);
      expect(mockSql).toHaveBeenCalledTimes(3);
    });

    it('tratamento defensivo de erros: se o banco falhar, captura e emite log sem lançar exceção', async () => {
      const dbError = new Error('Database connection timeout');
      mockSql.mockRejectedValueOnce(dbError);

      let threw = false;
      let result;
      try {
        result = await trackSaleLinkAccess(defaultParams);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toEqual({ tracked: false, isUnique: false });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: dbError,
          linkId: defaultParams.linkId,
          token: defaultParams.token,
        }),
        expect.stringContaining('Erro ao rastrear acesso')
      );
    });
  });

  describe('4. calculateConversionMetrics', () => {
    it('deve calcular taxas de conversão com 1 casa decimal corretamente', () => {
      const metrics = calculateConversionMetrics(200, 150, 30, 6);

      // conversionRateCotacao = (30 / 200) * 100 = 15.0%
      // conversionRateVenda = (6 / 200) * 100 = 3.0%
      // fechamentoRate = (6 / 30) * 100 = 20.0%
      expect(metrics).toEqual({
        conversionRateCotacao: 15.0,
        conversionRateVenda: 3.0,
        fechamentoRate: 20.0,
      });
    });

    it('deve arredondar valores com frações para 1 casa decimal', () => {
      const metrics = calculateConversionMetrics(3, 3, 1, 1);

      // conversionRateCotacao = (1 / 3) * 100 = 33.333... -> 33.3%
      // conversionRateVenda = (1 / 3) * 100 = 33.333... -> 33.3%
      // fechamentoRate = (1 / 1) * 100 = 100.0%
      expect(metrics).toEqual({
        conversionRateCotacao: 33.3,
        conversionRateVenda: 33.3,
        fechamentoRate: 100.0,
      });
    });

    it('deve retornar 0% com segurança quando viewsCount for 0 (evitar divisão por zero)', () => {
      const metrics = calculateConversionMetrics(0, 0, 0, 0);

      expect(metrics).toEqual({
        conversionRateCotacao: 0,
        conversionRateVenda: 0,
        fechamentoRate: 0,
      });
    });

    it('deve retornar 0% de fechamento quando totalCotacoes for 0', () => {
      const metrics = calculateConversionMetrics(50, 40, 0, 0);

      expect(metrics).toEqual({
        conversionRateCotacao: 0,
        conversionRateVenda: 0,
        fechamentoRate: 0,
      });
    });

    it('deve tratar entradas negativas ou inválidas com segurança', () => {
      const metrics = calculateConversionMetrics(-10, -5, -2, -1);

      expect(metrics).toEqual({
        conversionRateCotacao: 0,
        conversionRateVenda: 0,
        fechamentoRate: 0,
      });
    });
  });
});
