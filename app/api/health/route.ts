export async function GET() {
  return Response.json({
    ok: true,
    service: 'duolife-hub',
    timestamp: new Date().toISOString(),
  });
}
