import { NextRequest } from 'next/server';
import { handleMcpProtocolRequest, MCP_TOOLS_DEFINITIONS } from '@/lib/mcp/server';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error: payload JSON inválido.',
          data: { errorCode: 'INVALID_INPUT', recoverable: false, message: 'JSON malformado' },
        },
      },
      { status: 400 }
    );
  }

  const { statusCode, response } = await handleMcpProtocolRequest(body, authHeader, clientIp);

  return Response.json(response, {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function GET() {
  return Response.json(
    {
      name: 'duolife-mcp-server',
      version: '1.0.0',
      description: 'Camada Model Context Protocol (MCP) para vendas assistidas por IA de seguros RC no DuoLife Hub.',
      protocolVersion: '2024-11-05',
      toolsCount: MCP_TOOLS_DEFINITIONS.length,
      tools: MCP_TOOLS_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        requiredScope: t.requiredScope,
      })),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
