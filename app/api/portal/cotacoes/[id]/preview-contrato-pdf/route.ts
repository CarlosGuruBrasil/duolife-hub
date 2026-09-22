import { NextRequest } from 'next/server';
import { handlePreviewContratoPdf } from '@/lib/contrato-preview-handler';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handlePreviewContratoPdf(req, params);
}
