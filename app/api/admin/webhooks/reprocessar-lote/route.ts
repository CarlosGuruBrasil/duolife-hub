/**
 * Reprocessamento em lote DESATIVADO.
 *
 * Webhooks antigos, pendentes ou com erro não podem ser reexecutados em massa.
 * Cada evento deve ser analisado e executado individualmente por um administrador
 * em /admin/auditoria-webhooks (rota /api/admin/webhooks/[id]/reprocessar).
 */
export async function POST() {
  return Response.json(
    {
      ok: false,
      error:
        'Reprocessamento em lote desativado. Analise e execute cada webhook individualmente na Auditoria de Webhooks.',
    },
    { status: 410 }
  );
}
