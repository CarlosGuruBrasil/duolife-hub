'use client';

import { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Users,
  Shield,
  WalletCards,
  ArrowRight,
  RefreshCw,
  X,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import { parseCsvContent, type RawCsvRow } from '@/lib/csv-parser';

export default function CsvImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<RawCsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Estados de importação
  const [isImporting, setIsImporting] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);

  // Métricas acumuladas
  const [totals, setTotals] = useState({
    clientsCreated: 0,
    clientsUpdated: 0,
    quotesCreated: 0,
    salesCreated: 0,
    ordersCreated: 0,
    installmentsCreated: 0,
    signaturesCreated: 0,
    errorsCount: 0,
  });

  const [importErrors, setImportErrors] = useState<Array<{ row: number; name?: string; doc?: string; message: string }>>([]);
  const [importCompleted, setImportCompleted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Identificação de colunas cruciais
  const requiredColumns = ['Nome', 'Cpf', 'Email', 'Valor', 'DataCompra', 'Nomeplano'];
  const presentColumns = useMemo(() => {
    return requiredColumns.filter((col) =>
      headers.some((h) => h.toLowerCase() === col.toLowerCase())
    );
  }, [headers]);

  function handleFileSelected(selectedFile: File) {
    setParseError(null);
    setImportCompleted(false);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = (e.target?.result as string) || '';
        setCsvText(text);
        const { headers: parsedHeaders, rows } = parseCsvContent(text);

        if (rows.length === 0) {
          setParseError('O arquivo CSV parece estar vazio ou não contém registros além do cabeçalho.');
          setHeaders([]);
          setParsedRows([]);
          return;
        }

        setHeaders(parsedHeaders);
        setParsedRows(rows);
      } catch (err) {
        setParseError('Erro ao interpretar o arquivo CSV. Certifique-se de que é um CSV válido com codificação UTF-8.');
      }
    };
    reader.onerror = () => {
      setParseError('Falha ao ler o arquivo selecionado.');
    };
    reader.readAsText(selectedFile, 'UTF-8');
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (!droppedFile.name.toLowerCase().endsWith('.csv')) {
        setParseError('Por favor, envie um arquivo com extensão .csv.');
        return;
      }
      handleFileSelected(droppedFile);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function startImport() {
    if (parsedRows.length === 0) return;

    setIsImporting(true);
    setImportCompleted(false);
    setProcessedCount(0);
    setImportErrors([]);
    setTotals({
      clientsCreated: 0,
      clientsUpdated: 0,
      quotesCreated: 0,
      salesCreated: 0,
      ordersCreated: 0,
      installmentsCreated: 0,
      signaturesCreated: 0,
      errorsCount: 0,
    });

    const BATCH_SIZE = 50;
    const batches: RawCsvRow[][] = [];
    for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
      batches.push(parsedRows.slice(i, i + BATCH_SIZE));
    }

    setTotalBatches(batches.length);

    let accClients = 0;
    let accQuotes = 0;
    let accSales = 0;
    let accOrders = 0;
    let accInstallments = 0;
    let accSignatures = 0;
    let accErrors = 0;
    const collectedErrors: Array<{ row: number; name?: string; doc?: string; message: string }> = [];

    for (let b = 0; b < batches.length; b++) {
      setCurrentBatch(b + 1);
      const batchRows = batches[b];
      const startingRowIndex = b * BATCH_SIZE + 1;

      try {
        const res = await fetch('/api/admin/importar-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: batchRows,
            startingRowIndex,
          }),
        });

        const json = await res.json();
        if (json.ok) {
          accClients += (json.clientsCreated || 0) + (json.clientsUpdated || 0);
          accQuotes += json.quotesCreated || 0;
          accSales += json.salesCreated || 0;
          accOrders += json.ordersCreated || 0;
          accInstallments += json.installmentsCreated || 0;
          accSignatures += json.signaturesCreated || 0;
          accErrors += json.errorsCount || 0;

          if (Array.isArray(json.errors) && json.errors.length > 0) {
            collectedErrors.push(...json.errors);
          }

          setTotals({
            clientsCreated: accClients,
            clientsUpdated: 0,
            quotesCreated: accQuotes,
            salesCreated: accSales,
            ordersCreated: accOrders,
            installmentsCreated: accInstallments,
            signaturesCreated: accSignatures,
            errorsCount: accErrors,
          });
          setImportErrors([...collectedErrors]);
        } else {
          accErrors += batchRows.length;
          collectedErrors.push({
            row: startingRowIndex,
            message: json.error || 'Erro desconhecido no lote',
          });
          setImportErrors([...collectedErrors]);
        }
      } catch (err) {
        accErrors += batchRows.length;
        collectedErrors.push({
          row: startingRowIndex,
          message: 'Falha de comunicação com a API no lote.',
        });
        setImportErrors([...collectedErrors]);
      }

      setProcessedCount((prev) => Math.min(parsedRows.length, prev + batchRows.length));
    }

    setIsImporting(false);
    setImportCompleted(true);
  }

  function resetImport() {
    setFile(null);
    setCsvText('');
    setHeaders([]);
    setParsedRows([]);
    setParseError(null);
    setImportCompleted(false);
    setProcessedCount(0);
    setImportErrors([]);
  }

  const progressPercentage = parsedRows.length > 0
    ? Math.round((processedCount / parsedRows.length) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* 1. Header Hero Card */}
      <section className="bg-white rounded-2xl border border-gray-200/80 p-6 md:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-xs font-bold text-[#0e4a5a] mb-3">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#00d4e0]" />
              <span>DESENVOLVIMENTO & CARGA DE DADOS</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
              Importador CSV de Clientes e Vendas
            </h1>
            <p className="text-gray-600 text-sm md:text-base mt-2 max-w-3xl">
              Faça o upload do arquivo CSV consolidado para popular as tabelas de <strong>Clientes</strong>,{' '}
              <strong>Cotações</strong>, <strong>Vendas / Apólices</strong>, <strong>Ordens & Parcelas Asaas</strong> e{' '}
              <strong>Contratos ZapSign</strong> com integridade relacional.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/admin/comparativo-wix"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-semibold text-sm transition-all"
            >
              Comparativo Wix
            </Link>
            <Link
              href="/admin/clientes"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0e4a5a] hover:bg-[#072a33] text-white font-bold text-sm shadow-sm transition-all"
            >
              Ver Clientes Cadastrados
              <ArrowRight className="w-4 h-4 text-[#00d4e0]" />
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Área de Upload / Dropzone */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-[#0e4a5a] bg-white rounded-2xl p-10 text-center cursor-pointer transition-all hover:shadow-md group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelected(e.target.files[0]);
              }
            }}
            className="hidden"
          />
          <div className="w-16 h-16 rounded-2xl bg-cyan-50 border border-cyan-200 text-[#0e4a5a] flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-8 h-8 text-[#0e4a5a]" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            Arraste seu arquivo CSV ou clique para selecionar
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Compatível com o layout de exportação Wix / Net4Life (71 colunas incluindo dados cadastrais, parcelas JSON, Asaas e ZapSign).
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Formato aceito: .CSV (Codificação UTF-8)</span>
          </div>
        </div>
      )}

      {/* Erro de leitura */}
      {parseError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{parseError}</span>
          </div>
          <button
            onClick={() => setParseError(null)}
            className="text-red-500 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Arquivo Selecionado & Análise Prévia */}
      {file && parsedRows.length > 0 && (
        <div className="space-y-6">
          {/* Card de Informações do Arquivo */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight">{file.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB • <strong>{parsedRows.length.toLocaleString('pt-BR')}</strong> linhas detectadas •{' '}
                    <strong>{headers.length}</strong> colunas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={resetImport}
                  disabled={isImporting}
                  className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Trocar Arquivo
                </button>
                {!importCompleted && (
                  <button
                    onClick={startImport}
                    disabled={isImporting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                    {isImporting ? 'Importando Lotes...' : 'Iniciar Importação no Banco'}
                  </button>
                )}
              </div>
            </div>

            {/* Validação de Colunas */}
            <div className="pt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-gray-700 flex items-center gap-1 mr-2">
                <Info className="w-3.5 h-3.5 text-[#0e4a5a]" /> Colunas Principais:
              </span>
              {requiredColumns.map((col) => {
                const found = headers.some((h) => h.toLowerCase() === col.toLowerCase());
                return (
                  <span
                    key={col}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium ${
                      found
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border border-amber-200 text-amber-800'
                    }`}
                  >
                    {found ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
                    {col}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Barra de Progresso Durante a Importação */}
          {(isImporting || importCompleted) && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-900">
                  {isImporting
                    ? `Processando Lote ${currentBatch} de ${totalBatches}...`
                    : 'Processamento Concluído!'}
                </span>
                <span className="font-mono font-bold text-[#0e4a5a]">
                  {processedCount} de {parsedRows.length} linhas ({progressPercentage}%)
                </span>
              </div>

              {/* Barra */}
              <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden border border-gray-200">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    importCompleted ? 'bg-emerald-600' : 'bg-[#0e4a5a]'
                  }`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              {/* Cards de Métricas em Tempo Real */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-center">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Clientes Salvos</div>
                  <div className="text-xl font-extrabold text-gray-900 mt-1">{totals.clientsCreated}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-center">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cotações Criadas</div>
                  <div className="text-xl font-extrabold text-[#0e4a5a] mt-1">{totals.quotesCreated}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-center">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Apólices / Vendas</div>
                  <div className="text-xl font-extrabold text-emerald-600 mt-1">{totals.salesCreated}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-center">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Parcelas Asaas</div>
                  <div className="text-xl font-extrabold text-indigo-600 mt-1">{totals.installmentsCreated}</div>
                </div>
              </div>

              {importCompleted && (
                <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100">
                  <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Carga concluída com sucesso no banco de dados local!
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/admin/clientes"
                      className="px-3.5 py-2 rounded-xl bg-[#0e4a5a] text-white text-xs font-bold hover:bg-[#072a33] transition-colors"
                    >
                      Acessar Carteira de Clientes
                    </Link>
                    <Link
                      href="/admin/vendas"
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                    >
                      Acessar Painel de Vendas
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lista de Erros (se houver) */}
          {importErrors.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-xs space-y-3">
              <h4 className="text-sm font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Linhas com Inconsistências ({importErrors.length})
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs text-red-800">
                {importErrors.map((err, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-red-50/70 border border-red-100 flex items-center justify-between">
                    <span>
                      Linha {err.row}: <strong>{err.name || 'Sem nome'}</strong> ({err.doc || 'Sem CPF'})
                    </span>
                    <span className="font-medium text-red-700">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pré-Visualização das Primeiras 5 Linhas */}
          {!importCompleted && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0e4a5a]" />
                  Amostra dos Dados (Primeiros 5 Registros)
                </h4>
                <span className="text-xs text-gray-400">Total no arquivo: {parsedRows.length}</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Nome</th>
                      <th className="p-3">CPF</th>
                      <th className="p-3">Plano</th>
                      <th className="p-3">Cobertura</th>
                      <th className="p-3">Prêmio Anual</th>
                      <th className="p-3">Parcela</th>
                      <th className="p-3">Vigência</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Parceiro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {parsedRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                        <td className="p-3 font-mono text-gray-400">{i + 1}</td>
                        <td className="p-3 font-bold text-gray-900 whitespace-nowrap">{r['Nome'] || '-'}</td>
                        <td className="p-3 font-mono text-gray-600 whitespace-nowrap">{r['Cpf'] || '-'}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-[#0e4a5a] font-bold text-[10px]">
                            {r['Nomeplano'] || '100k'}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">{r['Valorcobertura'] || '-'}</td>
                        <td className="p-3 font-bold text-gray-900 whitespace-nowrap">R$ {r['Valor'] || '0'}</td>
                        <td className="p-3 whitespace-nowrap">{r['Parcela'] ? `${r['Parcela']}x` : '1x'}</td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">
                          {r['Início da Vigência']?.slice(0, 10) || r['DataCompra']?.slice(0, 10) || '-'}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[10px]">
                            {r['Status Geral'] || r['Status'] || 'Novo'}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600 whitespace-nowrap">{r['CodigoVenda'] || 'Matriz'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
