export interface RawCsvRow {
  [key: string]: string | undefined;
}

/**
 * Parser RFC-4180 puro em TypeScript, 100% isolado para o browser (Client Component safe).
 * Sem dependências de Node.js (fs, os, postgres).
 */
export function parseCsvContent(csvText: string): { headers: string[]; rows: RawCsvRow[] } {
  const result: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = csvText.length;

  // Remove eventual BOM UTF-8
  if (csvText.charCodeAt(0) === 0xfeff) {
    i = 1;
  }

  while (i < len) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Aspa dupla escapada ("")
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Fim do campo cotado
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r' || char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
          result.push(currentRow);
        }
        currentRow = [];
        // Pula \r\n se for o caso
        if (char === '\r' && i + 1 < len && csvText[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Último campo pendente
  if (currentField !== '' || inQuotes || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
      result.push(currentRow);
    }
  }

  if (result.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = result[0].map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: RawCsvRow[] = [];

  for (let r = 1; r < result.length; r++) {
    const rowArray = result[r];
    const rowObj: RawCsvRow = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      rowObj[rawHeaders[c]] = rowArray[c] !== undefined ? rowArray[c].trim() : '';
    }
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}
