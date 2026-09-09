import { sql } from './pg';
import { logger } from './logger';

export interface WixPartnerCatalogItem {
  nome: string;
  codigo: string;
  login?: string;
  email?: string;
  wixId: string;
  telefone?: string;
  cargo?: string;
}

export const WIX_PARTNERS_CATALOG: WixPartnerCatalogItem[] = [
  { nome: 'Fabiano', codigo: 'Fabiano', login: '', email: 'desativado', wixId: '08ea9042-8b2d-4376-a241-4d8d876ffe6e', cargo: 'Parceiro', telefone: '(48) 98820-7922' },
  { nome: 'Sandro', codigo: 'Sandroceo', login: 'Sandro', email: 'sandro@worknetseguros.com.br', wixId: '0a78b0b8-6298-440e-bd50-d619f999973d', cargo: 'Admin', telefone: '(48) 99911-1331' },
  { nome: 'srcap', codigo: 'srcap', login: '', email: 'desativado', wixId: '13040c0a-3b98-458f-832c-5d69047cd60d', cargo: 'Parceiro' },
  { nome: 'Rayane Suellen Rios', codigo: 'drarayane', login: 'drarayane', email: 'rayaneriosadv@hotmail.com', wixId: '1c0989c2-a45f-4916-aecc-cdb73e296e1e', cargo: 'Parceiro', telefone: '(61) 82597-389' },
  { nome: 'caapr2', codigo: 'caapr2', login: '', email: 'desativado', wixId: '23dc6eea-5e09-47ef-8951-506b26cced43', cargo: 'Parceiro' },
  { nome: 'Carlos Guru', codigo: 'Guru', login: 'Guru', email: 'macabongo@gmail.com', wixId: '27dbf9be-aa31-4a38-ab23-c2c8a9ddd056', cargo: 'Admin', telefone: '(51) 99666-6901' },
  { nome: 'Karla', codigo: 'karla', login: 'karla', email: 'desativado', wixId: '288b46c0-2041-47d4-ad27-6051ed4dfe09', cargo: 'Parceiro', telefone: '(48) 99185-5005' },
  { nome: 'caadf', codigo: 'caadf', login: '', email: 'relacionamento@caadf.org.br', wixId: '378fb36c-d570-4c95-a9a1-9c5e57221eb3', cargo: 'Parceiro', telefone: '(61) 99803-9356' },
  { nome: 'caasc', codigo: 'caasc', login: '', email: 'convenios@caasc.org.br', wixId: '39b091ce-ebfe-4b4d-a31a-0c79d788fc2c', cargo: 'Parceiro', telefone: '(48) 98817-2589' },
  { nome: 'Paulo Serafini', codigo: 'pauloserafini', login: 'pauloserafini', email: 'paulors-seguros@hotmail.com', wixId: '5105042a-d89f-4dc8-a2d4-7e03ec59196c', cargo: 'Parceiro', telefone: '(48) 9992-1342' },
  { nome: 'Carlos', codigo: 'carlos', login: 'Carlos', email: 'carlosad1981@gmail.com', wixId: '528e62a9-b27b-4cc4-b7ad-caeb6ae58421', cargo: 'Admin', telefone: '(48) 98414-8790' },
  { nome: 'Laiane Tavares', codigo: 'laianetavares', login: 'Laiane', email: 'vendas1@net4life.com.br', wixId: '56da30d9-2b8c-4196-b436-2eeb0225d0a6', cargo: 'Parceiro', telefone: '(48) 99976-8219' },
  { nome: 'Andréia Possebon', codigo: 'andreiapossebon', login: '', email: 'desativado', wixId: '59e619aa-905b-4252-afb8-b3789e875066', cargo: 'Parceiro', telefone: '(48) 98805-5466' },
  { nome: 'caapr', codigo: 'caapr', login: '', email: 'raquelgoncalves.adv@gmail.com', wixId: '5fd14a49-b523-4c7f-8885-741f5b8c7660', cargo: 'Parceiro', telefone: '(41) 3250-5820' },
  { nome: 'Vitória Tosta', codigo: 'vitoriatosta', login: '', email: 'desativado', wixId: '831cb841-cc0e-4078-9aa4-78596915efa6', cargo: 'Parceiro' },
  { nome: 'Vanessa Damasco', codigo: 'vanessadamasco', login: '', email: 'desativado', wixId: '90ab0f64-73de-46c9-a418-25d37ebe157c', cargo: 'Parceiro' },
  { nome: 'Rafael Viana', codigo: 'rafaelviana', login: '', email: 'desativado', wixId: '998f9321-213d-4538-8c84-017f06c84d40', cargo: 'Parceiro' },
  { nome: 'sdrultimachance', codigo: 'sdrultimachance', login: '', email: 'desativado', wixId: 'a3efad00-c853-43c0-b853-db99697ac60b', cargo: 'Parceiro' },
  { nome: 'Henry', codigo: 'henry', login: 'Henry', email: 'supervisor@worknetseguros.com.br', wixId: 'b308f8da-c499-4435-8d80-d75fcf381c6e', cargo: 'Admin', telefone: '(48) 99139-4912' },
  { nome: 'Josiane Licheski', codigo: 'josianelicheski', login: 'josianelicheski', email: 'gerencia@worknetseguros.com.br', wixId: 'cd735d2e-adb0-41e4-affc-a7bcccfdbc5f', cargo: 'Parceiro', telefone: '(48) 99131-7540' },
  { nome: 'APRESENTAÇÃO', codigo: 'apresentacao', login: 'apresentacao', email: 'macabongo@gmail.com', wixId: 'cf5e60f4-b4ad-4a37-841d-ccd0267b32b5', cargo: 'Parceiro', telefone: '(51) 99666-6901' },
  { nome: 'caamg', codigo: 'caamg', login: '', email: 'convenios@caamg.com.br', wixId: 'd90a8a22-3b2e-483b-9204-bba6cf24459e', cargo: 'Parceiro', telefone: '(31) 2125-6312' },
  { nome: 'Luiza', codigo: 'luiza', login: 'luiza', email: 'vendas02@net4life.com.br', wixId: 'ebc47c74-de43-4c61-991b-c8906b471e40', cargo: 'Parceiro' },
  { nome: 'Luciana', codigo: 'luciana', login: 'luciana', email: 'residencial@worknetseguros.com.br', wixId: 'f7c8772e-e7b4-40dd-9ad2-7a9ac02a2209', cargo: 'Parceiro', telefone: '(48) 99917-1270' },
  { nome: 'Simone', codigo: 'simone', login: 'Simone', email: 'adm@net4life.com.br', wixId: 'ff19fd56-99ba-4aa8-9fb5-3a6ce5253060', cargo: 'Admin', telefone: '(48) 99138-1758' }
];

/**
 * Normaliza strings de parceiro para chave única de busca: minúsculas, sem acentos, sem caracteres especiais.
 * Ex: "Laiane Tavares" -> "laianetavares", "Andréia Possebon" -> "andreiapossebon"
 */
export function normalizePartnerKey(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Garante que todos os 25 parceiros conhecidos do Wix existam como entidades na tabela `partners`.
 */
export async function seedWixPartnersIfMissing(): Promise<void> {
  const existingPartners = await sql<Array<{ id: string; razao_social: string; email: string; metadata: unknown }>>`
    SELECT id, razao_social, email, metadata FROM partners
  `;

  for (const item of WIX_PARTNERS_CATALOG) {
    const normCod = normalizePartnerKey(item.codigo);
    const normNome = normalizePartnerKey(item.nome);
    const normLogin = normalizePartnerKey(item.login);

    const exists = existingPartners.some((p) => {
      const pNormRazao = normalizePartnerKey(p.razao_social);
      const metaStr = JSON.stringify(p.metadata || '');
      return (
        (normCod && (pNormRazao === normCod || metaStr.includes(item.codigo) || metaStr.includes(item.wixId))) ||
        (normNome && pNormRazao === normNome) ||
        (normLogin && pNormRazao === normLogin)
      );
    });

    if (!exists) {
      const email =
        item.email && item.email !== 'desativado'
          ? item.email
          : `parceiro.${normCod}@duolife.local`;

      try {
        await sql`
          INSERT INTO partners (
            razao_social,
            nome_fantasia,
            email,
            phone,
            status,
            corretora_id,
            metadata
          )
          VALUES (
            ${item.nome},
            ${item.nome},
            ${email},
            ${item.telefone || null},
            ${item.email === 'desativado' ? 'inactive' : 'active'},
            'corretora_net4life_001',
            ${JSON.stringify({
              wix: {
                wixId: item.wixId,
                partnerCode: item.codigo,
                login: item.login || null,
                cargo: item.cargo || 'Parceiro',
              },
            })}::jsonb
          )
          ON CONFLICT (email) DO NOTHING
        `;
      } catch (err) {
        logger.warn({ err, item }, 'Não foi possível auto-cadastrar parceiro do catálogo Wix');
      }
    }
  }
}

export interface PartnerResolutionContext {
  partnerByCodeMap: Map<string, string>;
  fallbackPartnerId: string;
  partnerByIdMap: Map<string, { id: string; razao_social: string }>;
}

/**
 * Carrega e indexa todos os parceiros do banco com suporte a todos os aliases e códigos do Wix.
 */
export async function loadPartnerResolutionContext(): Promise<PartnerResolutionContext> {
  // Garante sementes dos 25 parceiros
  await seedWixPartnersIfMissing();

  const partnerRows = await sql<
    Array<{
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
      metadata: unknown;
    }>
  >`
    SELECT id, razao_social, nome_fantasia, metadata
    FROM partners
    WHERE status != 'suspended'
  `;

  const partnerByCodeMap = new Map<string, string>();
  const partnerByIdMap = new Map<string, { id: string; razao_social: string }>();
  let fallbackPartnerId = '';

  for (const p of partnerRows) {
    partnerByIdMap.set(p.id, { id: p.id, razao_social: p.razao_social });

    const razao = p.razao_social.trim().toLowerCase();
    const fantasia = (p.nome_fantasia || '').trim().toLowerCase();
    const normRazao = normalizePartnerKey(p.razao_social);
    const normFantasia = normalizePartnerKey(p.nome_fantasia);

    if (razao) partnerByCodeMap.set(razao, p.id);
    if (fantasia) partnerByCodeMap.set(fantasia, p.id);
    if (normRazao) partnerByCodeMap.set(normRazao, p.id);
    if (normFantasia) partnerByCodeMap.set(normFantasia, p.id);
    partnerByCodeMap.set(p.id.toLowerCase(), p.id);

    // Extrai tokens de metadados em qualquer formato (objeto, array ou string)
    const metaStr = JSON.stringify(p.metadata || {});
    const matches = metaStr.matchAll(
      /"(?:partnerCode|codigo|login|slug|wixCode|externalId)":\s*"([^"]+)"/gi
    );
    for (const m of matches) {
      const val = m[1]?.trim();
      if (val) {
        partnerByCodeMap.set(val.toLowerCase(), p.id);
        const normVal = normalizePartnerKey(val);
        if (normVal) partnerByCodeMap.set(normVal, p.id);
      }
    }

    if (
      normRazao.includes('net4life') ||
      razao.includes('net4life') ||
      p.id === 'corretora_net4life_001'
    ) {
      fallbackPartnerId = p.id;
    }
  }

  // Fallback padrão se não houver corretora Net4life explícita
  if (!fallbackPartnerId && partnerRows.length > 0) {
    fallbackPartnerId = partnerRows[0].id;
  }

  // Indexa os 25 parceiros do catálogo mapeando suas variações diretamente para os IDs encontrados
  for (const kp of WIX_PARTNERS_CATALOG) {
    const foundId =
      partnerByCodeMap.get(normalizePartnerKey(kp.codigo)) ||
      partnerByCodeMap.get(normalizePartnerKey(kp.nome)) ||
      (kp.login ? partnerByCodeMap.get(normalizePartnerKey(kp.login)) : null) ||
      partnerByCodeMap.get(kp.wixId.toLowerCase());

    if (foundId) {
      partnerByCodeMap.set(normalizePartnerKey(kp.codigo), foundId);
      partnerByCodeMap.set(kp.codigo.toLowerCase().trim(), foundId);
      partnerByCodeMap.set(normalizePartnerKey(kp.nome), foundId);
      if (kp.login) {
        partnerByCodeMap.set(normalizePartnerKey(kp.login), foundId);
        partnerByCodeMap.set(kp.login.toLowerCase().trim(), foundId);
      }
      partnerByCodeMap.set(kp.wixId.toLowerCase(), foundId);
    }
  }

  // Indexa parceiros através de partner_users se houver
  try {
    const userRows = await sql<Array<{ partner_id: string; name: string; email: string }>>`
      SELECT partner_id, name, email FROM partner_users WHERE is_active = true
    `;
    for (const u of userRows) {
      const normName = normalizePartnerKey(u.name);
      if (normName && !partnerByCodeMap.has(normName)) {
        partnerByCodeMap.set(normName, u.partner_id);
      }
      if (u.email) {
        const emailPrefix = normalizePartnerKey(u.email.split('@')[0]);
        if (emailPrefix && !partnerByCodeMap.has(emailPrefix)) {
          partnerByCodeMap.set(emailPrefix, u.partner_id);
        }
      }
    }
  } catch {}

  return {
    partnerByCodeMap,
    fallbackPartnerId,
    partnerByIdMap,
  };
}

/**
 * Resolve o parceiro a partir do CodigoVenda ou identificador similar.
 */
export function resolvePartnerFromCode(
  rawCode: string | null | undefined,
  context: PartnerResolutionContext
): string {
  if (!rawCode) return context.fallbackPartnerId;

  const trimmed = String(rawCode).trim();
  const lower = trimmed.toLowerCase();
  const norm = normalizePartnerKey(trimmed);

  return (
    context.partnerByCodeMap.get(norm) ||
    context.partnerByCodeMap.get(lower) ||
    context.fallbackPartnerId
  );
}
