'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface ExportarVendasCsvButtonProps {
  endpoint?: string;
  className?: string;
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;

  // Tenta extrair filename* (RFC 5987 / RFC 6266 com encoding UTF-8)
  const utf8Match = header.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  // Tenta extrair filename="nome.csv" ou filename=nome.csv
  const match = header.match(/filename=["']?([^"';\n]+)["']?/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  return null;
}

export default function ExportarVendasCsvButton({
  endpoint = '/api/admin/vendas/exportar',
  className = '',
}: ExportarVendasCsvButtonProps) {
  const searchParams = useSearchParams();
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleExport() {
    if (isDownloading) return;

    setIsDownloading(true);

    try {
      const queryString = searchParams?.toString();
      const url = queryString
        ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`
        : endpoint;

      const response = await fetch(url, {
        method: 'GET',
      });

      if (!response.ok) {
        let errorMessage = 'Não foi possível exportar os dados no momento.';
        try {
          const errorJson = await response.json();
          if (errorJson?.error && typeof errorJson.error === 'string') {
            errorMessage = errorJson.error;
          }
        } catch {
          if (response.status === 401 || response.status === 403) {
            errorMessage = 'Acesso não autorizado para exportar este relatório.';
          } else if (response.status === 404) {
            errorMessage = 'Nenhum dado encontrado para exportação.';
          }
        }
        throw new Error(errorMessage);
      }

      // Extrai nome do arquivo ou fallback para padrão com data ISO
      const contentDisposition = response.headers.get('content-disposition');
      const filename =
        parseContentDispositionFilename(contentDisposition) ||
        `relatorio-vendas-${new Date().toISOString().slice(0, 10)}.csv`;

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);

      toast.success('Relatório CSV exportado com sucesso!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao exportar relatório CSV.';
      toast.error(msg);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isDownloading}
      aria-label="Exportar relatório de vendas em formato CSV"
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {isDownloading ? (
        <>
          <Loader2 size={16} className="animate-spin text-gray-500" />
          <span>Exportando...</span>
        </>
      ) : (
        <>
          <Download size={16} className="text-gray-500" />
          <span>Exportar CSV</span>
        </>
      )}
    </button>
  );
}

export { ExportarVendasCsvButton };
