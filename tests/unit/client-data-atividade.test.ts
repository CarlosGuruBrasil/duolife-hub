import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseDateInput,
  extractClientDataAtividade,
  syncQuoteClientData,
} from '@/lib/client-data-atividade';
import { GET, PATCH } from '../../app/api/clientes/[id]/route';
import { NextRequest } from 'next/server';

// Mocks para módulos externos da rota
vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  isInternalUser: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
  getPartnerAccessContext: vi.fn(),
}));

vi.mock('@/lib/pg', () => {
  const sqlMock: any = vi.fn();
  return { sql: sqlMock };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { verifyAuth, isInternalUser } from '@/lib/auth';
import { sql } from '@/lib/pg';

describe('client-data-atividade - Validação, Parsing e Sincronização de Início Profissional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Parsing seguro de datas (parseDateInput)', () => {
    it('deve converter data no padrão ISO YYYY-MM-DD', () => {
      expect(parseDateInput('2020-05-15')).toBe('2020-05-15');
      expect(parseDateInput('1995-12-31')).toBe('1995-12-31');
      expect(parseDateInput('2024-01-01')).toBe('2024-01-01');
    });

    it('deve converter data no padrão brasileiro DD/MM/YYYY para YYYY-MM-DD', () => {
      expect(parseDateInput('15/05/2020')).toBe('2020-05-15');
      expect(parseDateInput('31/12/1995')).toBe('1995-12-31');
      expect(parseDateInput('01/01/2024')).toBe('2024-01-01');
    });

    it('deve aceitar string ISO com timestamp e extrair YYYY-MM-DD', () => {
      expect(parseDateInput('2021-08-10T14:30:00.000Z')).toBe('2021-08-10');
      expect(parseDateInput('2023-11-20T00:00:00.000Z')).toBe('2023-11-20');
    });

    it('deve aceitar instâncias de Date válidas', () => {
      const date = new Date(Date.UTC(2019, 6, 20));
      expect(parseDateInput(date)).toBe('2019-07-20');
    });

    it('deve limpar espaços em branco no início e no fim', () => {
      expect(parseDateInput('   2022-03-15   ')).toBe('2022-03-15');
      expect(parseDateInput('   15/03/2022   ')).toBe('2022-03-15');
    });

    it('deve retornar null para valores vazios, nulos ou indefinidos', () => {
      expect(parseDateInput(null)).toBeNull();
      expect(parseDateInput(undefined)).toBeNull();
      expect(parseDateInput('')).toBeNull();
      expect(parseDateInput('    ')).toBeNull();
    });

    it('deve retornar null para datas com formatação inválida', () => {
      expect(parseDateInput('banana')).toBeNull();
      expect(parseDateInput('2020/05/15')).toBeNull();
      expect(parseDateInput('15-05-2020')).toBeNull();
      expect(parseDateInput('31.12.2020')).toBeNull();
      expect(parseDateInput('abc-def-ghij')).toBeNull();
    });

    it('deve retornar null para dias e meses fora dos limites do calendário', () => {
      expect(parseDateInput('32/01/2022')).toBeNull();
      expect(parseDateInput('15/13/2022')).toBeNull();
      expect(parseDateInput('00/05/2022')).toBeNull();
      expect(parseDateInput('15/00/2022')).toBeNull();
      expect(parseDateInput('31/02/2023')).toBeNull(); // Fevereiro não possui dia 31
      expect(parseDateInput('29/02/2023')).toBeNull(); // 2023 não é bissexto
      expect(parseDateInput('29/02/2024')).toBe('2024-02-29'); // 2024 é bissexto
    });

    it('deve retornar null para anos fora do intervalo seguro (1900 a 2100)', () => {
      expect(parseDateInput('01/01/1899')).toBeNull();
      expect(parseDateInput('01/01/2101')).toBeNull();
      expect(parseDateInput('1899-12-31')).toBeNull();
      expect(parseDateInput('2101-01-01')).toBeNull();
    });
  });

  describe('2. Extração hierárquica de início profissional (extractClientDataAtividade)', () => {
    it('deve priorizar metadata.dataAtividade quando presente', () => {
      const metadata = { dataAtividade: '2015-03-01' };
      const latestClientData = { dataAtividade: '2018-06-01', inicioProfissional: '2020-01-01' };

      const result = extractClientDataAtividade(metadata, latestClientData);
      expect(result).toBe('2015-03-01');
    });

    it('deve fazer fallback para latestClientData.dataAtividade se metadata não tiver a data', () => {
      const metadata = { address: { cep: '01001-000' } };
      const latestClientData = { dataAtividade: '2018-06-01', inicioProfissional: '2020-01-01' };

      const result = extractClientDataAtividade(metadata, latestClientData);
      expect(result).toBe('2018-06-01');
    });

    it('deve fazer fallback para latestClientData.inicioProfissional se dataAtividade não estiver definido', () => {
      const metadata = {};
      const latestClientData = { inicioProfissional: '10/04/2017' };

      const result = extractClientDataAtividade(metadata, latestClientData);
      expect(result).toBe('2017-04-10');
    });

    it('deve retornar null se nenhum dos campos contiver data válida', () => {
      expect(extractClientDataAtividade(null, null)).toBeNull();
      expect(extractClientDataAtividade({}, {})).toBeNull();
      expect(extractClientDataAtividade({ dataAtividade: '' }, { inicioProfissional: 'invalido' })).toBeNull();
    });
  });

  describe('3. Sincronização cadastral e de minuta em cotações (syncQuoteClientData)', () => {
    const baseCd = {
      nome: 'Dr. Fulano Original',
      cpfCnpj: '12345678901',
      email: 'original@exemplo.com',
      celular: '11999990000',
      dataAtividade: '2015-01-01',
      inicioProfissional: '2015-01-01',
    };

    it('deve atualizar dataAtividade e inicioProfissional quando hasDataAtividadePayload for true', () => {
      const updated = syncQuoteClientData(baseCd, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        parsedDataAtividade: '2018-05-15',
        hasDataAtividadePayload: true,
      });

      expect(updated.dataAtividade).toBe('2018-05-15');
      expect(updated.inicioProfissional).toBe('2018-05-15');
      expect(updated.nome).toBe('Dr. Fulano Atualizado');
    });

    it('deve permitir limpar dataAtividade e inicioProfissional para null se enviado nulo', () => {
      const updated = syncQuoteClientData(baseCd, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        parsedDataAtividade: null,
        hasDataAtividadePayload: true,
      });

      expect(updated.dataAtividade).toBeNull();
      expect(updated.inicioProfissional).toBeNull();
    });

    it('não deve alterar dataAtividade/inicioProfissional se hasDataAtividadePayload for false', () => {
      const updated = syncQuoteClientData(baseCd, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        hasDataAtividadePayload: false,
      });

      expect(updated.dataAtividade).toBe('2015-01-01');
      expect(updated.inicioProfissional).toBe('2015-01-01');
    });

    it('não deve marcar minuta como desatualizada para cotações sem contrato gerado ou token', () => {
      const updated = syncQuoteClientData(baseCd, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        status: 'proposta_criada',
        hasDataAtividadePayload: true,
        parsedDataAtividade: '2020-01-01',
      });

      expect(updated.minutaDesatualizada).toBeUndefined();
      expect(updated.minutaAlteradaEm).toBeUndefined();
      expect(updated.minutaDesatualizadaMotivo).toBeUndefined();
    });

    it('deve marcar minuta como desatualizada quando cotação estiver em contrato_gerado', () => {
      const updated = syncQuoteClientData(baseCd, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        status: 'contrato_gerado',
        hasDataAtividadePayload: true,
        parsedDataAtividade: '2020-01-01',
      });

      expect(updated.minutaDesatualizada).toBe(true);
      expect(typeof updated.minutaAlteradaEm).toBe('string');
      expect(updated.minutaDesatualizadaMotivo).toBe(
        'Início profissional ou dados cadastrais do cliente alterados'
      );
    });

    it('deve marcar minuta como desatualizada quando cotação possuir contratoToken', () => {
      const cdWithToken = {
        ...baseCd,
        contratoToken: 'token-abc-123',
      };

      const updated = syncQuoteClientData(cdWithToken, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        status: 'aguardando_assinatura',
        hasDataAtividadePayload: true,
        parsedDataAtividade: '2020-01-01',
      });

      expect(updated.minutaDesatualizada).toBe(true);
      expect(typeof updated.minutaAlteradaEm).toBe('string');
      expect(updated.minutaDesatualizadaMotivo).toBe(
        'Início profissional ou dados cadastrais do cliente alterados'
      );
    });

    it('deve sincronizar endereço completo quando fornecido', () => {
      const updated = syncQuoteClientData(baseCd, {
        fullName: 'Dr. Fulano Atualizado',
        documentNumber: '12345678901',
        address: {
          cep: '89201-000',
          logradouro: 'Rua das Flores',
          numero: '123',
          complemento: 'Sala 401',
          bairro: 'Centro',
          cidade: 'Joinville',
          uf: 'SC',
        },
      });

      expect(updated.cep).toBe('89201-000');
      expect(updated.logradouro).toBe('Rua das Flores');
      expect(updated.rua).toBe('Rua das Flores');
      expect(updated.numero).toBe('123');
      expect(updated.complemento).toBe('Sala 401');
      expect(updated.bairro).toBe('Centro');
      expect(updated.cidade).toBe('Joinville');
      expect(updated.uf).toBe('SC');
    });
  });

  describe('4. Suporte aos 4 aliases de payload no PATCH', () => {
    it('deve resolver corretamente todos os aliases aceitos', () => {
      const aliases = [
        { dataAtividade: '2016-07-01' },
        { data_atividade: '01/07/2016' },
        { inicioProfissional: '2016-07-01' },
        { inicio_profissional: '01/07/2016' },
      ];

      for (const payload of aliases) {
        const raw =
          payload.dataAtividade ??
          payload.data_atividade ??
          payload.inicioProfissional ??
          payload.inicio_profissional;
        const parsed = parseDateInput(raw);
        expect(parsed).toBe('2016-07-01');
      }
    });
  });

  describe('5. Handlers da API de Clientes (GET e PATCH)', () => {
    it('GET deve retornar client com dataAtividade, data_atividade e inicioProfissional formatados', async () => {
      vi.mocked(verifyAuth).mockResolvedValueOnce({ id: 'user-admin', role: 'admin' } as any);
      vi.mocked(isInternalUser).mockReturnValueOnce(true);

      const fakeClient = {
        id: 'client-123',
        document_number: '12345678901',
        document_type: 'cpf',
        full_name: 'Maria Silva',
        email: 'maria@exemplo.com',
        phone: '11988887777',
        birth_date: '1985-04-12',
        metadata: { dataAtividade: '2012-08-20' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock queries: 1) SELECT insurance_clients, 2) SELECT cotacoes (latest), 3) SELECT cotacoes (list)
      const mockSql = sql as any;
      mockSql
        .mockResolvedValueOnce([fakeClient] as any)
        .mockResolvedValueOnce([{ client_data: {} }] as any)
        .mockResolvedValueOnce([] as any);

      const req = new NextRequest('http://localhost/api/clientes/client-123');
      const res = await GET(req, { params: Promise.resolve({ id: 'client-123' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.client.dataAtividade).toBe('2012-08-20');
      expect(data.client.data_atividade).toBe('2012-08-20');
      expect(data.client.inicioProfissional).toBe('2012-08-20');
      expect(data.client.birth_date).toBe('1985-04-12');
    });

    it('GET deve fazer fallback para client_data da cotação mais recente se metadata não tiver dataAtividade', async () => {
      vi.mocked(verifyAuth).mockResolvedValueOnce({ id: 'user-admin', role: 'admin' } as any);
      vi.mocked(isInternalUser).mockReturnValueOnce(true);

      const fakeClient = {
        id: 'client-456',
        document_number: '98765432100',
        document_type: 'cpf',
        full_name: 'Carlos Oliveira',
        email: 'carlos@exemplo.com',
        phone: '47999998888',
        birth_date: '1980-10-05',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockSql = sql as any;
      mockSql
        .mockResolvedValueOnce([fakeClient] as any)
        .mockResolvedValueOnce([{ client_data: { inicioProfissional: '15/03/2010' } }] as any)
        .mockResolvedValueOnce([] as any);

      const req = new NextRequest('http://localhost/api/clientes/client-456');
      const res = await GET(req, { params: Promise.resolve({ id: 'client-456' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.client.dataAtividade).toBe('2010-03-15');
      expect(data.client.data_atividade).toBe('2010-03-15');
      expect(data.client.inicioProfissional).toBe('2010-03-15');
    });

    it('PATCH deve aceitar inicioProfissional no payload e retornar campos formatados', async () => {
      vi.mocked(verifyAuth).mockResolvedValueOnce({ id: 'user-admin', role: 'admin' } as any);
      vi.mocked(isInternalUser).mockReturnValueOnce(true);

      const existingClient = {
        id: 'client-789',
        document_number: '12345678901',
        document_type: 'cpf',
        full_name: 'Dra. Ana Santos',
        email: 'ana@exemplo.com',
        phone: '11977776666',
        birth_date: '1990-06-15',
        metadata: {},
      };

      const updatedClientFromDb = {
        ...existingClient,
        metadata: { dataAtividade: '2016-09-01' },
      };

      const mockSql = sql as any;
      mockSql
        .mockResolvedValueOnce([existingClient] as any) // SELECT existing
        .mockResolvedValueOnce([updatedClientFromDb] as any) // UPDATE insurance_clients
        .mockResolvedValueOnce([
          {
            id: 'quote-1',
            status: 'contrato_gerado',
            client_data: { contratoToken: 'token-xyz', nome: 'Dra. Ana' },
          },
        ] as any) // SELECT quotesToUpdate
        .mockResolvedValueOnce([] as any); // UPDATE cotacoes

      const req = new NextRequest('http://localhost/api/clientes/client-789', {
        method: 'PATCH',
        body: JSON.stringify({
          inicioProfissional: '01/09/2016',
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'client-789' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.client.dataAtividade).toBe('2016-09-01');
      expect(data.client.data_atividade).toBe('2016-09-01');
      expect(data.client.inicioProfissional).toBe('2016-09-01');
    });
  });
});
