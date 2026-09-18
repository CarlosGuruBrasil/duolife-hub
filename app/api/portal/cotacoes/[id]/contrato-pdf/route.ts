import { NextRequest } from 'next/server';
import { handleContratoPdfRequest } from '@/lib/contrato-pdf';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleContratoPdfRequest(req, id);
}
