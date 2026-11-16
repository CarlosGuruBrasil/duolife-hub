import { sql } from './pg';
import { logger } from './logger';
import { CARGOS_PPE_PADRAO } from './product-schemas/types';
import { normalizarSimNaoPpe, parsePpeCargoIds } from './ppe-utils';

export { normalizarSimNaoPpe, parsePpeCargoIds };

/**
 * Declaração PPE (Pessoa Politicamente Exposta) pronta para impressão no contrato.
 *
 * Fonte única usada pelos geradores de PDF (Gotenberg e pdf-lib), para que a
 * declaração apareça no contrato independentemente do motor que gerou o documento.
 */
export interface PpeContratoInfo {
  ppeCargos: 'Sim' | 'Não';
  ppeRepresenta: 'Sim' | 'Não';
  /** Descrições textuais dos cargos declarados (vazio quando não há cargo). */
  cargos: string[];
}

/**
 * Carrega o catálogo de cargos PPE (coleção Wix PPECARGOS), completando com o
 * catálogo padrão do sistema para IDs ausentes ou quando a coleção não foi sincronizada.
 */
export async function carregarCatalogoCargosPpe(): Promise<Map<string, string>> {
  const catalogo = new Map<string, string>(CARGOS_PPE_PADRAO.map((c) => [c.id, c.text]));

  try {
    const rows = await sql<{ payload: unknown }[]>`
      SELECT payload FROM wix_items
      WHERE wix_collection_id IN (
        SELECT id FROM wix_collections WHERE collection_id = 'PPECARGOS'
      )
      AND is_active = true
    `;
    for (const row of rows ?? []) {
      try {
        const parsed: any = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const data = parsed?.item?.data;
        const id = data?.id_ !== undefined && data?.id_ !== null ? String(data.id_) : '';
        const text = data?.text ? String(data.text).trim() : '';
        if (id && text) catalogo.set(id, text);
      } catch {
        // Item malformado: mantém o catálogo padrão para esse ID
      }
    }
  } catch (err) {
    logger.warn({ err }, 'ppe_contrato.catalogo_wix_indisponivel_usando_padrao');
  }

  return catalogo;
}

/**
 * Resolve a declaração PPE do client_data com as descrições dos cargos.
 * IDs sem correspondência no catálogo são mantidos como vieram (podem já ser texto livre).
 */
export async function resolverPpeContrato(clientData: Record<string, any>): Promise<PpeContratoInfo> {
  const base = montarPpeContrato(clientData, null);
  if (base.cargos.length === 0) return base;
  return montarPpeContrato(clientData, await carregarCatalogoCargosPpe());
}

/**
 * Versão síncrona: usa apenas o catálogo padrão do sistema (sem consulta ao banco).
 * Usada quando o chamador não pré-resolveu a declaração PPE.
 */
export function resolverPpeContratoPadrao(clientData: Record<string, any>): PpeContratoInfo {
  return montarPpeContrato(clientData, new Map(CARGOS_PPE_PADRAO.map((c) => [c.id, c.text])));
}

function montarPpeContrato(clientData: Record<string, any>, catalogo: Map<string, string> | null): PpeContratoInfo {
  const ppeCargos = normalizarSimNaoPpe(clientData.ppeCargos, clientData.ppe, clientData.tem_cargos);
  const ppeRepresenta = normalizarSimNaoPpe(
    clientData.ppeRepresenta,
    clientData.ppeRelacionado,
    clientData.representante_legal
  );

  const ids = parsePpeCargoIds(clientData.ppeCargoSelect);
  if (ids.length === 0 || (ppeCargos === 'Não' && ppeRepresenta === 'Não')) {
    return { ppeCargos, ppeRepresenta, cargos: [] };
  }

  const cargos = ids.map((id) => catalogo?.get(id) ?? id);
  return { ppeCargos, ppeRepresenta, cargos };
}
