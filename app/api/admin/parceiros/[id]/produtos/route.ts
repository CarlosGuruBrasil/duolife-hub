import { z } from 'zod';
import { isPlatformAdmin, verifyAdminAuth, unauthorized } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/pg';
import { ensureSchema } from '@/lib/schema';

// Habilitação de produto vista pelo lado do parceiro. O mesmo vínculo já era editável pelo
// lado do produto (uma tela, N parceiros); aqui é o inverso (um parceiro, N produtos), que é
// como a operação pensa ao cadastrar uma corretora nova.
const bodySchema = z.object({
  productIds: z.array(z.string().trim().min(1)).max(500),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();
  if (!isPlatformAdmin(admin)) {
    return Response.json({ error: 'Habilitar produto é exclusivo de administradores' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Lista de produtos inválida' }, { status: 400 });
  }

  const { id: partnerId } = await params;
  const habilitados = [...new Set(parsed.data.productIds)];

  try {
    await ensureSchema();

    const resultado = await sql.begin(async (tx) => {
      const [partner] = await tx`SELECT id FROM partners WHERE id = ${partnerId} LIMIT 1`;
      if (!partner) return null;

      // Só aceita id de produto que existe: um id inventado no corpo da requisição viraria
      // uma linha órfã de habilitação, invisível na tela e impossível de desfazer por ela.
      const validos = habilitados.length
        ? (await tx<{ id: string }[]>`SELECT id FROM products WHERE id IN ${tx(habilitados)}`).map((p) => p.id)
        : [];

      if (validos.length) {
        await tx`
          INSERT INTO partner_product_availability (partner_id, product_id, is_active)
          SELECT ${partnerId}, product_id, true FROM UNNEST(${validos}::text[]) AS product_id
          ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true, updated_at = NOW()
        `;
      }

      // Desabilitar é marcar inativo, não apagar: o histórico de quem já pôde vender o quê
      // é o que explica uma cotação antiga de produto hoje bloqueado.
      const desativados = validos.length
        ? await tx`
            UPDATE partner_product_availability
            SET is_active = false, updated_at = NOW()
            WHERE partner_id = ${partnerId} AND is_active = true AND product_id NOT IN ${tx(validos)}
            RETURNING product_id
          `
        : await tx`
            UPDATE partner_product_availability
            SET is_active = false, updated_at = NOW()
            WHERE partner_id = ${partnerId} AND is_active = true
            RETURNING product_id
          `;

      return { habilitados: validos.length, desabilitados: desativados.length };
    });

    if (!resultado) {
      return Response.json({ error: 'Parceiro não encontrado' }, { status: 404 });
    }

    logger.info({ adminId: admin.userId, partnerId, ...resultado }, 'admin.partner_products.updated');
    return Response.json({ ok: true, ...resultado });
  } catch (err) {
    logger.error({ err, partnerId }, 'admin.partner_products.update.failed');
    return Response.json({ error: 'Erro interno ao salvar os produtos do parceiro' }, { status: 500 });
  }
}
