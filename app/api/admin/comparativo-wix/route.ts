import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { compareClientsWithWix, syncWixClientsToLocalDb } from '@/lib/wix-compare';
import { syncWixSalesToLocalDb } from '@/lib/wix-sales-sync';
import { normalizeDigits } from '@/lib/wix-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  if (!roleIsDev(admin.role)) {
    return Response.json(
      { error: 'Acesso permitido exclusivamente a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    const result = await compareClientsWithWix();
    return Response.json({ ok: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao processar comparativo com Wix';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.comparison.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(_req: NextRequest) {
  const admin = await verifyAdminAuth();
  if (!admin) return unauthorized();

  if (!roleIsDev(admin.role)) {
    return Response.json(
      { error: 'Acesso permitido exclusivamente a desenvolvedores (duolife_dev).' },
      { status: 403 }
    );
  }

  try {
    // 1. Executa comparativo preliminar para identificar quais clientes são idênticos e quais têm divergências
    const initialComparison = await compareClientsWithWix();

    const divergentDocs: string[] = [];
    for (const row of initialComparison.rows) {
      if (row.matchStatus === 'divergent') {
        const doc = normalizeDigits(row.primaryDocument);
        if (doc) divergentDocs.push(doc);
      }
    }

    // 2. Sincroniza dados cadastrais (insurance_clients e leads) APENAS dos clientes iguais ou novos
    // Clientes divergentes são preservados sem modificação até que o administrador decida
    const clientSyncResult = await syncWixClientsToLocalDb({
      excludeDocuments: divergentDocs,
    });

    // 3. Sincroniza compras, cotações, ordens de pagamento e parcelas APENAS dos clientes iguais ou novos
    // Clientes com divergência cadastral NÃO têm compras geradas automaticamente
    const salesSyncResult = await syncWixSalesToLocalDb({
      excludeDocuments: divergentDocs,
    });

    // 4. Gera o comparativo atualizado para a interface
    const freshComparison = await compareClientsWithWix();

    logger.info({
      adminId: admin.userId,
      divergentCount: divergentDocs.length,
      clientsImported: clientSyncResult.importedCount,
      clientsUpdated: clientSyncResult.updatedCount,
      salesCreated: salesSyncResult.salesCreated,
      quotesCreated: salesSyncResult.quotesCreated,
      ordersCreated: salesSyncResult.ordersCreated,
      installmentsCreated: salesSyncResult.installmentsCreated,
    }, 'admin.wix.comparativo_sync.completed');

    return Response.json({
      ok: true,
      sync: clientSyncResult,
      salesSync: salesSyncResult,
      divergentCount: divergentDocs.length,
      data: freshComparison,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao sincronizar do Wix';
    logger.error({ err, adminId: admin.userId }, 'admin.wix.sync_comparativo.failed');
    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
