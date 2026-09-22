import fs from 'fs/promises';
import path from 'path';
import { sql } from './pg';
import { parseJsonbField } from './json-safe';
import { logger } from './logger';

export interface CorretoraContratoInfo {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  susep: string;
  email: string;
  phone: string;
  enderecoFormatado: string;
  logoBuffer: Buffer | null;
  logoMimeType: 'image/png' | 'image/jpeg' | null;
}

/**
 * Formata CNPJ para exibição oficial: 00.000.000/0000-00
 */
export function formatCnpj(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 14) return raw;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Formata Telefone para exibição oficial
 */
export function formatPhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  }
  return raw;
}

/**
 * Carrega a logo da corretora ou a oficial da DuoLife como fallback resiliente.
 */
async function loadLogoBuffer(logoUrl?: string | null): Promise<{ buffer: Buffer | null; mime: 'image/png' | 'image/jpeg' | null }> {
  const publicDir = path.join(process.cwd(), 'public');

  // 1. Tenta carregar a URL configurada se for local
  if (logoUrl && logoUrl.startsWith('/')) {
    try {
      const cleanPath = path.normalize(logoUrl).replace(/^(\.\.[\/\\])+/, '');
      const fullPath = path.join(publicDir, cleanPath);
      const data = await fs.readFile(fullPath);
      const mime = fullPath.toLowerCase().endsWith('.jpg') || fullPath.toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
      return { buffer: data, mime };
    } catch (err) {
      logger.warn({ logoUrl, err }, 'corretora_resolver.local_logo_not_found');
    }
  }

  // 2. Tenta carregar se for URL externa
  if (logoUrl && (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))) {
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        const mime = logoUrl.toLowerCase().includes('.jpg') || logoUrl.toLowerCase().includes('.jpeg')
          ? 'image/jpeg'
          : 'image/png';
        return { buffer: Buffer.from(arr), mime };
      }
    } catch (err) {
      logger.warn({ logoUrl, err }, 'corretora_resolver.remote_logo_failed');
    }
  }

  // 3. Fallback: logo DuoLife oficial
  try {
    const fallbackPath = path.join(publicDir, 'logo-horizontal.png');
    const data = await fs.readFile(fallbackPath);
    return { buffer: data, mime: 'image/png' };
  } catch (err) {
    logger.warn({ err }, 'corretora_resolver.fallback_logo_not_found');
    return { buffer: null, mime: null };
  }
}

/**
 * Resolve todas as informações cadastrais e visuais da corretora vinculada à cotação.
 */
export async function getCorretoraParaContrato(cotacaoId: string): Promise<CorretoraContratoInfo> {
  // Busca a cotação e resolve a corretora por precedência:
  // 1. cotacoes.corretora_id
  // 2. partners.corretora_id (via cotacoes.partner_id)
  // 3. Primeira corretora ativa no sistema
  const [row] = await sql<{
    corretora_id: string | null;
    partner_corretora_id: string | null;
  }[]>`
    SELECT 
      c.corretora_id,
      p.corretora_id as partner_corretora_id
    FROM cotacoes c
    LEFT JOIN partners p ON p.id = c.partner_id
    WHERE c.id = ${cotacaoId}
    LIMIT 1
  `;

  const targetCorretoraId = row?.corretora_id || row?.partner_corretora_id || 'corretora_net4life_001';

  let [corretora] = await sql<{
    id: string;
    razao_social: string;
    nome_fantasia: string;
    cnpj: string | null;
    susep: string | null;
    email: string;
    phone: string | null;
    address: any;
    metadata: any;
  }[]>`
    SELECT id, razao_social, nome_fantasia, cnpj, susep, email, phone, address, metadata
    FROM corretoras
    WHERE id = ${targetCorretoraId}
    LIMIT 1
  `;

  // Fallback caso não encontre pelo ID
  if (!corretora) {
    const [primeiraAtiva] = await sql<any[]>`
      SELECT id, razao_social, nome_fantasia, cnpj, susep, email, phone, address, metadata
      FROM corretoras
      WHERE status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    corretora = primeiraAtiva;
  }

  // Se mesmo assim não houver no banco, monta defaults DuoLife / NET4Life
  if (!corretora) {
    const { buffer, mime } = await loadLogoBuffer('/logo-horizontal.png');
    return {
      id: 'default',
      razaoSocial: 'DuoLife Seguros e Benefícios',
      nomeFantasia: 'DuoLife',
      cnpj: '00.000.000/0001-00',
      susep: '202018702',
      email: 'contato@duolife.net.br',
      phone: '(48) 3028-0033',
      enderecoFormatado: 'Florianópolis / SC',
      logoBuffer: buffer,
      logoMimeType: mime,
    };
  }

  const meta = parseJsonbField<Record<string, any>>(corretora.metadata);
  const whiteLabel = meta?.whiteLabel || {};
  const addr = parseJsonbField<Record<string, any>>(corretora.address);

  // Formatação amigável de endereço
  const enderecoParts = [
    addr.street,
    addr.number ? `nº ${addr.number}` : null,
    addr.neighborhood,
    addr.city && addr.state ? `${addr.city}/${addr.state}` : (addr.city || addr.state),
    addr.cep ? `CEP: ${addr.cep}` : null,
  ].filter(Boolean);
  const enderecoFormatado = enderecoParts.length > 0 ? enderecoParts.join(', ') : 'Brasil';

  const logoUrl = whiteLabel.logoUrl || '/images/corretoras/net4life-logo.png';
  const { buffer: logoBuffer, mime: logoMimeType } = await loadLogoBuffer(logoUrl);

  return {
    id: corretora.id,
    razaoSocial: corretora.razao_social || whiteLabel.companyName || corretora.nome_fantasia,
    nomeFantasia: corretora.nome_fantasia || whiteLabel.companyName || corretora.razao_social,
    cnpj: formatCnpj(corretora.cnpj),
    susep: String(corretora.susep || whiteLabel.susep || '').trim(),
    email: corretora.email || whiteLabel.companyEmail || 'contato@duolife.net.br',
    phone: formatPhone(corretora.phone || whiteLabel.companyPhone || ''),
    enderecoFormatado,
    logoBuffer,
    logoMimeType,
  };
}
