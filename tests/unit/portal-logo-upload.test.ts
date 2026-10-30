import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import path from 'path';

vi.mock('@/lib/auth', () => ({
  verifyPartnerAuth: vi.fn(),
  canManageOwnCompany: vi.fn(),
  unauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })),
}));

vi.mock('@/lib/schema', () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
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

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));

import { verifyPartnerAuth, canManageOwnCompany } from '@/lib/auth';
import { sql } from '@/lib/pg';
import fs from 'fs/promises';
import { POST } from '../../app/api/portal/perfil/logo/route';

describe('Portal Logo Upload API - POST (/api/portal/perfil/logo)', () => {
  const mockSql = sql as any;

  const partnerDirectorUser = {
    userId: 'user-director-01',
    partnerId: 'partner-100',
    corretoraId: 'corretora-50',
    role: 'partner_director' as const,
    partnerRole: 'director' as const,
    name: 'Diretor Parceiro',
    email: 'diretor@parceiro.com',
    permissions: {},
  };

  const partnerBrokerUser = {
    userId: 'user-broker-02',
    partnerId: 'partner-100',
    corretoraId: 'corretora-50',
    role: 'partner_broker' as const,
    partnerRole: 'broker' as const,
    name: 'Corretor Vendedor',
    email: 'corretor@parceiro.com',
    permissions: {},
  };

  const corretoraManagerUser = {
    userId: 'user-corretora-01',
    partnerId: null,
    corretoraId: 'corretora-50',
    role: 'corretora_gestor' as const,
    partnerRole: null,
    name: 'Gestor Corretora',
    email: 'gestor@corretora.com',
    permissions: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Autenticação e Autorização', () => {
    it('deve retornar 401 quando a requisição não estiver autenticada', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('file', new Blob([Buffer.from('conteudo-imagem')], { type: 'image/png' }), 'logo.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Não autorizado');
    });

    it('deve retornar 403 quando o usuário não tiver permissão para gerenciar a própria empresa (canManageOwnCompany === false)', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerBrokerUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(false);

      const formData = new FormData();
      formData.append('file', new Blob([Buffer.from('conteudo-imagem')], { type: 'image/png' }), 'logo.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Apenas diretores de parceiro ou gestores de corretora');
    });

    it('deve retornar 400 se o usuário autenticado não tiver partnerId nem corretoraId associados', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce({
        userId: 'user-isolado',
        partnerId: null,
        corretoraId: null,
        role: 'corretora_admin',
      } as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

      const formData = new FormData();
      formData.append('file', new Blob([Buffer.from('conteudo-imagem')], { type: 'image/png' }), 'logo.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Nenhum parceiro ou corretora associado');
    });
  });

  describe('2. Validação do Arquivo', () => {
    it('deve retornar 400 quando nenhum arquivo for enviado no FormData', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);
      mockSql.mockResolvedValueOnce([{ id: 'partner-100', metadata: {} }]);

      const formData = new FormData();
      // Não adiciona nenhum campo 'file' ou 'logo'

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Nenhum arquivo enviado');
    });

    it('deve retornar 400 quando o arquivo enviado estiver com tamanho zero (0 bytes)', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);
      mockSql.mockResolvedValueOnce([{ id: 'partner-100', metadata: {} }]);

      const formData = new FormData();
      formData.append('file', new Blob([], { type: 'image/png' }), 'vazio.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('O arquivo enviado está vazio');
    });

    it('deve retornar 400 com mensagem informativa quando o tipo MIME for inválido (ex: application/pdf)', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);
      mockSql.mockResolvedValueOnce([{ id: 'partner-100', metadata: {} }]);

      const formData = new FormData();
      formData.append('file', new Blob([Buffer.from('%PDF-1.4 documento')], { type: 'application/pdf' }), 'documento.pdf');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Formato de arquivo inválido');
      expect(data.error).toContain('PNG, JPG, SVG ou WEBP');
    });

    it('deve retornar 400 com mensagem informativa quando o arquivo for maior que 2MB (ex: 3MB)', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);
      mockSql.mockResolvedValueOnce([{ id: 'partner-100', metadata: {} }]);

      // Cria um buffer simulado de 3MB (3 * 1024 * 1024 + 10 bytes)
      const tresMegas = 3 * 1024 * 1024 + 10;
      const fakeLargeBuffer = new Uint8Array(tresMegas);
      const formData = new FormData();
      formData.append('file', new Blob([fakeLargeBuffer], { type: 'image/png' }), 'grande.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('2MB');
      expect(data.error).toContain('limite máximo permitido');
    });
  });

  describe('3. Upload com Sucesso e Persistência no Banco', () => {
    it('deve gravar arquivo PNG no diretório public/uploads/logos/, atualizar metadata do parceiro e retornar 200 com logoUrl', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

      // SELECT do parceiro atual
      mockSql.mockResolvedValueOnce([
        {
          id: 'partner-100',
          metadata: {
            whiteLabel: {
              companyName: 'Seguros Alpha',
              primaryColor: '#003366',
            },
          },
        },
      ]);
      // UPDATE do parceiro
      mockSql.mockResolvedValueOnce([]);

      const fileBytes = Buffer.from('bytes-da-imagem-png-valida');
      const formData = new FormData();
      formData.append('file', new Blob([fileBytes], { type: 'image/png' }), 'logo-parceiro.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.logoUrl).toMatch(/^\/uploads\/logos\/logo-partner-partner-100-\d+-[a-f0-9]+\.png$/);

      // Verifica chamada ao fs.mkdir com recursive: true
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/public[/\\]uploads[/\\]logos/),
        { recursive: true }
      );

      // Verifica escrita atômica: escrita no arquivo .tmp e renomeação para o arquivo final
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/public[/\\]uploads[/\\]logos[/\\]\.logo-partner-partner-100-.*\.tmp$/),
        expect.any(Buffer)
      );
      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        expect.stringMatching(/public[/\\]uploads[/\\]logos[/\\]logo-partner-partner-100-.*\.png$/)
      );

      // Verifica chamada ao banco para atualizar o metadata
      expect(mockSql).toHaveBeenCalledTimes(2);
      const updateCallArgs = mockSql.mock.calls[1];
      const serializedJson = updateCallArgs.find((arg: unknown) => typeof arg === 'string' && arg.includes('Seguros Alpha'));
      expect(serializedJson).toBeDefined();

      const parsedMeta = JSON.parse(serializedJson);
      expect(parsedMeta.whiteLabel.companyName).toBe('Seguros Alpha');
      expect(parsedMeta.whiteLabel.primaryColor).toBe('#003366');
      expect(parsedMeta.whiteLabel.logoUrl).toBe(data.logoUrl);
    });

    it('deve suportar upload de imagem por gestor de corretora atualizando a tabela corretoras', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(corretoraManagerUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

      // SELECT da corretora atual
      mockSql.mockResolvedValueOnce([
        {
          id: 'corretora-50',
          metadata: {
            whiteLabel: {
              companyName: 'Corretora Master',
            },
          },
        },
      ]);
      // UPDATE da corretora
      mockSql.mockResolvedValueOnce([]);

      const fileBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
      const formData = new FormData();
      formData.append('logo', new Blob([fileBytes], { type: 'image/svg+xml' }), 'vetor.svg');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.logoUrl).toMatch(/^\/uploads\/logos\/logo-corretora-corretora-50-\d+-[a-f0-9]+\.svg$/);

      // Verifica chamada ao banco atualizando corretoras
      expect(mockSql).toHaveBeenCalledTimes(2);
      const updateCallArgs = mockSql.mock.calls[1];
      const serializedJson = updateCallArgs.find((arg: unknown) => typeof arg === 'string' && arg.includes('Corretora Master'));
      expect(serializedJson).toBeDefined();

      const parsedMeta = JSON.parse(serializedJson);
      expect(parsedMeta.whiteLabel.companyName).toBe('Corretora Master');
      expect(parsedMeta.whiteLabel.logoUrl).toBe(data.logoUrl);
    });

    it('deve aceitar formatos JPEG e WEBP com as extensões apropriadas', async () => {
      // Teste com JPEG
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);
      mockSql.mockResolvedValueOnce([{ id: 'partner-100', metadata: {} }]);
      mockSql.mockResolvedValueOnce([]);

      const jpegFormData = new FormData();
      jpegFormData.append('file', new Blob([Buffer.from('jpeg-data')], { type: 'image/jpeg' }), 'foto.jpg');

      const jpegReq = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: jpegFormData,
      });

      const jpegRes = await POST(jpegReq);
      const jpegData = await jpegRes.json();
      expect(jpegRes.status).toBe(200);
      expect(jpegData.logoUrl).toMatch(/\.jpg$/);

      // Teste com WEBP
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);
      mockSql.mockResolvedValueOnce([{ id: 'partner-100', metadata: {} }]);
      mockSql.mockResolvedValueOnce([]);

      const webpFormData = new FormData();
      webpFormData.append('file', new Blob([Buffer.from('webp-data')], { type: 'image/webp' }), 'foto.webp');

      const webpReq = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: webpFormData,
      });

      const webpRes = await POST(webpReq);
      const webpData = await webpRes.json();
      expect(webpRes.status).toBe(200);
      expect(webpData.logoUrl).toMatch(/\.webp$/);
    });

    it('deve retornar 404 se o parceiro não for encontrado no banco de dados', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(partnerDirectorUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

      // Parceiro não encontrado no banco
      mockSql.mockResolvedValueOnce([]);

      const formData = new FormData();
      formData.append('file', new Blob([Buffer.from('imagem')], { type: 'image/png' }), 'logo.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Parceiro não encontrado');
    });

    it('deve retornar 404 se a corretora não for encontrada no banco de dados', async () => {
      vi.mocked(verifyPartnerAuth).mockResolvedValueOnce(corretoraManagerUser as any);
      vi.mocked(canManageOwnCompany).mockReturnValueOnce(true);

      // Corretora não encontrada no banco
      mockSql.mockResolvedValueOnce([]);

      const formData = new FormData();
      formData.append('file', new Blob([Buffer.from('imagem')], { type: 'image/png' }), 'logo.png');

      const req = new NextRequest('http://localhost/api/portal/perfil/logo', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Corretora não encontrada');
    });
  });
});
