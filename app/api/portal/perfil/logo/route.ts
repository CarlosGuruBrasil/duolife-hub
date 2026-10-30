import crypto from 'node:crypto';
import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { verifyPartnerAuth, canManageOwnCompany, unauthorized } from '@/lib/auth';
import { ensureSchema } from '@/lib/schema';
import { sql } from '@/lib/pg';
import { getWhiteLabelConfig, mergeWhiteLabelConfig } from '@/lib/white-label';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB em bytes

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/svg': 'svg',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  try {
    // 1. Verificação de Autenticação
    const user = await verifyPartnerAuth();
    if (!user) {
      return unauthorized();
    }

    // 2. Verificação de Permissão (Apenas diretores de parceiro ou gestores de corretora)
    if (!canManageOwnCompany(user)) {
      return NextResponse.json(
        { error: 'Apenas diretores de parceiro ou gestores de corretora podem alterar o logotipo' },
        { status: 403 }
      );
    }

    // 3. Garantir migrações e schema íntegro
    await ensureSchema();

    // 4. Identificar entidade associada (Parceiro ou Corretora)
    const entityType: 'partner' | 'corretora' = user.partnerId ? 'partner' : 'corretora';
    const entityId = user.partnerId || user.corretoraId;

    if (!entityId) {
      return NextResponse.json(
        { error: 'Nenhum parceiro ou corretora associado ao usuário' },
        { status: 400 }
      );
    }

    // 5. Verificar se a entidade existe no banco de dados
    let currentMetadata: Record<string, unknown> = {};
    if (entityType === 'partner') {
      const [current] = await sql<Array<{ id: string; metadata: Record<string, unknown> }>>`
        SELECT id, metadata
        FROM partners
        WHERE id = ${entityId}
        LIMIT 1
      `;
      if (!current) {
        return NextResponse.json({ error: 'Parceiro não encontrado' }, { status: 404 });
      }
      currentMetadata = current.metadata || {};
    } else {
      const [current] = await sql<Array<{ id: string; metadata: Record<string, unknown> }>>`
        SELECT id, metadata
        FROM corretoras
        WHERE id = ${entityId}
        LIMIT 1
      `;
      if (!current) {
        return NextResponse.json({ error: 'Corretora não encontrada' }, { status: 404 });
      }
      currentMetadata = current.metadata || {};
    }

    // 6. Extrair e validar o arquivo a partir de FormData
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'Requisição inválida ou nenhum arquivo enviado' },
        { status: 400 }
      );
    }

    const file = (formData.get('file') || formData.get('logo')) as File | null;
    if (!file || typeof file === 'string' || typeof (file as any).arrayBuffer !== 'function') {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado' },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'O arquivo enviado está vazio' },
        { status: 400 }
      );
    }

    // 7. Validação do tipo MIME (PNG, JPG, SVG, WEBP)
    const mimeType = (file.type || '').toLowerCase().trim();
    const ext = ALLOWED_MIME_TYPES[mimeType];
    if (!ext) {
      return NextResponse.json(
        { error: 'Formato de arquivo inválido. Tipos permitidos: PNG, JPG, SVG ou WEBP' },
        { status: 400 }
      );
    }

    // 8. Validação de tamanho (máximo 2MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'O arquivo excede o limite máximo permitido de 2MB' },
        { status: 400 }
      );
    }

    // 9. Gravação segura e atômica no diretório public/uploads/logos/
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    await fs.mkdir(uploadDir, { recursive: true });

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const fileName = `logo-${entityType}-${entityId}-${Date.now()}-${randomSuffix}.${ext}`;
    const finalFilePath = path.join(uploadDir, fileName);
    const tempFilePath = path.join(uploadDir, `.${fileName}.tmp`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Escrita atômica: salva no temporário e renomeia
    await fs.writeFile(tempFilePath, buffer);
    await fs.rename(tempFilePath, finalFilePath);

    const logoUrl = `/uploads/logos/${fileName}`;

    // 10. Atualização do WhiteLabel no banco de dados
    const currentConfig = getWhiteLabelConfig(currentMetadata);
    const nextMetadata = mergeWhiteLabelConfig(currentMetadata, { logoUrl });

    if (entityType === 'partner') {
      await sql`
        UPDATE partners
        SET metadata = ${JSON.stringify(nextMetadata)}::jsonb,
            updated_at = NOW()
        WHERE id = ${entityId}
      `;
    } else {
      await sql`
        UPDATE corretoras
        SET metadata = ${JSON.stringify(nextMetadata)}::jsonb,
            updated_at = NOW()
        WHERE id = ${entityId}
      `;
    }

    logger.info(
      {
        entityType,
        entityId,
        userId: user.userId,
        logoUrl,
        previousLogoUrl: currentConfig.logoUrl || null,
        fileSize: file.size,
        mimeType: file.type,
      },
      'portal.perfil.logo.uploaded'
    );

    return NextResponse.json({ ok: true, logoUrl }, { status: 200 });
  } catch (err) {
    logger.error({ err }, 'portal.perfil.logo.error');
    return NextResponse.json(
      { error: 'Erro interno ao processar upload do logotipo' },
      { status: 500 }
    );
  }
}
