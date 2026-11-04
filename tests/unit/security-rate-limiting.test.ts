import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCep } from '../../app/api/cep/[cep]/route';
import { getClientIp } from '@/lib/rate-limit';

describe('Task 8: Rate Limiting e Cache de CEP e Endpoints Públicos (VULN-09, VULN-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. getClientIp com mitigação de Spoofing (VULN-11)', () => {
    it('deve priorizar cf-connecting-ip sobre x-forwarded-for forjado', () => {
      const req = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'cf-connecting-ip': '203.0.113.195',
          'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        },
      });

      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('deve utilizar x-real-ip quando cf-connecting-ip nao estiver presente', () => {
      const req = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-real-ip': '198.51.100.42',
          'x-forwarded-for': '1.1.1.1',
        },
      });

      expect(getClientIp(req)).toBe('198.51.100.42');
    });
  });

  describe('2. Rate limiting no endpoint de CEP (/api/cep/[cep])', () => {
    it('deve retornar 429 Too Many Requests quando exceder o limite de requisicoes por IP', async () => {
      const ip = '192.0.2.77';

      // Dispara 35 requisições rápidas para o mesmo IP
      let lastResponse: any = null;
      for (let i = 0; i < 35; i++) {
        const req = new NextRequest(`http://localhost:3000/api/cep/01310100`, {
          headers: { 'cf-connecting-ip': ip },
        });
        lastResponse = await getCep(req, { params: Promise.resolve({ cep: '01310100' }) });
      }

      expect(lastResponse.status).toBe(429);
      const data = await lastResponse.json();
      expect(data.error).toMatch(/muitas tentativas|aguarde/i);
    });
  });

  describe('3. Cache in-memory de CEPs consultados', () => {
    it('deve responder a segunda consulta do mesmo CEP a partir do cache sem chamar provedores externos', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const req1 = new NextRequest(`http://localhost:3000/api/cep/01001000`, {
        headers: { 'cf-connecting-ip': '192.0.2.88' },
      });

      // Mock da resposta do ViaCEP
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cep: '01001-000',
            logradouro: 'Praça da Sé',
            complemento: 'lado ímpar',
            bairro: 'Sé',
            localidade: 'São Paulo',
            uf: 'SP',
          }),
          { status: 200 }
        )
      );

      const res1 = await getCep(req1, { params: Promise.resolve({ cep: '01001000' }) });
      expect(res1.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Segunda consulta para o mesmo CEP (deve vir do cache em memória)
      const req2 = new NextRequest(`http://localhost:3000/api/cep/01001000`, {
        headers: { 'cf-connecting-ip': '192.0.2.89' },
      });
      const res2 = await getCep(req2, { params: Promise.resolve({ cep: '01001000' }) });
      expect(res2.status).toBe(200);

      // Fetch NÃO deve ter sido chamado novamente!
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
