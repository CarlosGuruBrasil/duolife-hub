import { NextRequest } from 'next/server';
import { verifyAdminAuth, unauthorized } from '@/lib/auth';
import { roleIsDev } from '@/lib/roles';
import { compareClientsWithWix, syncWixClientsToLocalDb } from '@/lib/wix-compare';
import { syncWixSalesToLocalDb, type WixSalesSyncResult } from '@/lib/wix-sales-sync';
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
    const body = await _req.json().catch(() => ({}));
    const mode = body?.mode === 'only_new' ? 'only_new' : 'all';

    // 1. Executa comparativo preliminar para identificar quais clientes são idênticos e quais têm divergências
    const initialComparison = await compareClientsWithWix();

    const divergentDocs: string[] = [];
    for (const row of initialComparison.rows) {
      if (row.matchStatus === 'divergent') {
        const doc = normalizeDigits(row.primaryDocument);
        if (doc) divergentDocs.push(doc);
      }
    }

    if (mode === 'only_new') {
      // 2. Identifica apenas os registros que existem no Wix e NÃO existem no banco local
      const onlyWixRows = initialComparison.rows.filter((r) => r.matchStatus === 'only_wix');
      const onlyWixIds = onlyWixRows
        .map((r) => r.wixRecord?.id)
        .filter((id): id is string => Boolean(id));

      if (onlyWixIds.length === 0) {
        return Response.json({
          ok: true,
          mode: 'only_new',
          sync: {
            totalWixProcessed: 0,
            importedCount: 0,
            updatedCount: 0,
            unchangedCount: 0,
            errorsCount: 0,
            details: [],
            durationMs: 0,
          },
          salesSync: {
            totalWixProcessed: 0,
            salesCreated: 0,
            salesUpdated: 0,
            quotesCreated: 0,
            quotesUpdated: 0,
            ordersCreated: 0,
            installmentsCreated: 0,
            signaturesCreated: 0,
            pendingQuotesCount: 0,
            canceledQuotesCount: 0,
            totalRevenue: 0,
            durationMs: 0,
            details: [],
          },
          divergentCount: divergentDocs.length,
          data: initialComparison,
          message: 'Nenhum cliente novo no Wix para importar. Todos os registros já constam no banco local.',
        });
      }

      // Sincroniza cadastros APENAS dos registros novos (excluindo divergentes e ignorando existentes)
      const clientSyncResult = await syncWixClientsToLocalDb({
        excludeDocuments: divergentDocs,
        onlyWixIds,
        onlyNew: true,
      });

      // Coleta os registros que foram efetivamente importados nesta execução
      const newlyImportedWixIds = clientSyncResult.details
        .filter((d) => d.action === 'imported')
        .map((d) => d.wixId);

      const newlyImportedDocs = clientSyncResult.details
        .filter((d) => d.action === 'imported' && d.documentNumber)
        .map((d) => d.documentNumber!);

      let salesSyncResult: WixSalesSyncResult = {
        totalWixProcessed: 0,
        salesCreated: 0,
        salesUpdated: 0,
        quotesCreated: 0,
        quotesUpdated: 0,
        ordersCreated: 0,
        installmentsCreated: 0,
        signaturesCreated: 0,
        pendingQuotesCount: 0,
        canceledQuotesCount: 0,
        totalRevenue: 0,
        durationMs: 0,
        details: [],
      };

      if (newlyImportedWixIds.length > 0) {
        salesSyncResult = await syncWixSalesToLocalDb({
          excludeDocuments: divergentDocs,
          onlyWixIds: newlyImportedWixIds,
          onlyForDocuments: newlyImportedDocs,
          onlyNew: true,
        });
      }

      const freshComparison = await compareClientsWithWix();

      logger.info({
        adminId: admin.userId,
        mode: 'only_new',
        divergentCount: divergentDocs.length,
        clientsImported: clientSyncResult.importedCount,
        salesCreated: salesSyncResult.salesCreated,
        quotesCreated: salesSyncResult.quotesCreated,
        ordersCreated: salesSyncResult.ordersCreated,
        installmentsCreated: salesSyncResult.installmentsCreated,
      }, 'admin.wix.comparativo_sync_only_new.completed');

      return Response.json({
        ok: true,
        mode: 'only_new',
        sync: clientSyncResult,
        salesSync: salesSyncResult,
        divergentCount: divergentDocs.length,
        data: freshComparison,
      });
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
      mode: 'all',
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
      mode: 'all',
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
