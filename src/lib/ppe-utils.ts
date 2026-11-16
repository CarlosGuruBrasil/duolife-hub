/**
 * Utilitários puros (sem acesso a banco) para a declaração PPE (Pessoa Politicamente Exposta).
 * Seguros para uso em componentes client e no servidor.
 */

/** Normaliza o primeiro candidato preenchido para 'Sim' | 'Não' (padrão 'Não'). */
export function normalizarSimNaoPpe(...candidates: unknown[]): 'Sim' | 'Não' {
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    if (raw === true || raw === 1) return 'Sim';
    if (raw === false || raw === 0) return 'Não';
    const norm = String(raw)
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (!norm) continue;
    if (['sim', 's', 'true', '1', 'yes', 'y'].includes(norm)) return 'Sim';
    if (['nao', 'n', 'false', '0', 'no'].includes(norm)) return 'Não';
  }
  return 'Não';
}

/**
 * Converte o `ppeCargoSelect` gravado no client_data em lista de IDs.
 * Aceita array (portal/admin), string separada por vírgula (gravada pela edição da
 * proposta e pelo Wix) e o marcador '0' ("não desempenho cargo"), que é descartado.
 */
export function parsePpeCargoIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  const parts = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;#\n]/);
  const ids = parts.map((p) => p.trim()).filter((p) => p && p !== '0');
  return Array.from(new Set(ids));
}
