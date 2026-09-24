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
  endereco?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
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
 * Carrega o buffer do logo a partir de Data URI (base64 no banco), arquivo local ou URL externa.
 */
async function loadLogoBuffer(logoUrl?: string | null): Promise<{ buffer: Buffer | null; mime: 'image/png' | 'image/jpeg' | null }> {
  if (!logoUrl) return { buffer: null, mime: null };

  // 1. Suporte direto a Data URI base64 gravado no banco de dados (ex: data:image/png;base64,...)
  if (logoUrl.startsWith('data:image/')) {
    try {
      const match = logoUrl.match(/^data:(image\/[a-zA-Z0-9\+]+);base64,(.+)$/);
      if (match) {
        const rawMime = match[1].toLowerCase();
        const mime = rawMime === 'image/jpeg' || rawMime === 'image/jpg' ? 'image/jpeg' : 'image/png';
        const buffer = Buffer.from(match[2], 'base64');
        return { buffer, mime };
      }
    } catch (err) {
      logger.warn({ err }, 'corretora_resolver.data_uri_decode_failed');
      return { buffer: null, mime: null };
    }
  }

  const publicDir = path.join(process.cwd(), 'public');

  // 2. Tenta carregar a URL configurada se for arquivo local
  if (logoUrl.startsWith('/')) {
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
      return { buffer: null, mime: null };
    }
  }

  // 3. Tenta carregar se for URL externa
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
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

  return { buffer: null, mime: null };
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
    logo_base64?: string | null;
    logo_mime_type?: string | null;
  }[]>`
    SELECT id, razao_social, nome_fantasia, cnpj, susep, email, phone, address, metadata, logo_base64, logo_mime_type
    FROM corretoras
    WHERE id = ${targetCorretoraId}
    LIMIT 1
  `;

  // Fallback caso não encontre pelo ID
  if (!corretora) {
    const [primeiraAtiva] = await sql<any[]>`
      SELECT id, razao_social, nome_fantasia, cnpj, susep, email, phone, address, metadata, logo_base64, logo_mime_type
      FROM corretoras
      WHERE status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    corretora = primeiraAtiva;
  }

  // Se mesmo assim não houver no banco, monta defaults DuoLife / NET4Life
  if (!corretora) {
    const { buffer, mime } = await loadLogoBuffer('/images/corretoras/net4life-logo.png');
    return {
      id: 'default',
      razaoSocial: 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
      nomeFantasia: 'NET4LIFE',
      cnpj: '34.567.890/0001-12',
      susep: '202058392',
      email: 'contato@net4life.com.br',
      phone: '(48) 99139-4912',
      enderecoFormatado: 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05, Santo Antônio de Lisboa, Florianópolis/SC, CEP: 88050-000',
      endereco: 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05',
      bairro: 'Santo Antônio de Lisboa',
      cep: '88050-000',
      cidade: 'Florianópolis',
      uf: 'SC',
      logoBuffer: buffer,
      logoMimeType: mime,
    };
  }

  const meta = parseJsonbField<Record<string, any>>(corretora.metadata);
  const whiteLabel = meta?.whiteLabel || {};
  const addr = parseJsonbField<Record<string, any>>(corretora.address);

  // Formatação amigável de endereço
  const enderecoLinha = [
    addr.street,
    addr.number ? (addr.street?.includes(',') ? addr.number : `, ${addr.number}`) : null,
    addr.complement ? `, ${addr.complement}` : null,
  ].filter(Boolean).join('');

  const enderecoParts = [
    addr.street,
    addr.number ? `nº ${addr.number}` : null,
    addr.neighborhood,
    addr.city && addr.state ? `${addr.city}/${addr.state}` : (addr.city || addr.state),
    addr.cep ? `CEP: ${addr.cep}` : null,
  ].filter(Boolean);
  const enderecoFormatado = enderecoParts.length > 0 ? enderecoParts.join(', ') : 'Brasil';

  // 1. Resolução do logotipo oficial da corretora
  let logoBuffer: Buffer | null = null;
  let logoMimeType: 'image/png' | 'image/jpeg' | null = null;

  // Prioridade 1: Imagem armazenada diretamente na coluna logo_base64 no banco de dados
  if (corretora.logo_base64) {
    try {
      logoBuffer = Buffer.from(corretora.logo_base64, 'base64');
      logoMimeType = corretora.logo_mime_type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    } catch (e) {
      logger.warn({ err: e, corretoraId: corretora.id }, 'corretora_resolver.logo_base64_error');
    }
  }

  // Prioridade 2: URL ou Data URI configurado no whiteLabel
  if (!logoBuffer && whiteLabel.logoUrl) {
    const loaded = await loadLogoBuffer(whiteLabel.logoUrl);
    logoBuffer = loaded.buffer;
    logoMimeType = loaded.mime;
  }

  // Prioridade 3: Se for a própria corretora NET4Life, pode usar o logo padrão local se não tiver outro
  const isNet4Life = corretora.id === 'corretora_net4life_001' || String(corretora.cnpj || '').includes('07351909000133');
  if (!logoBuffer && isNet4Life) {
    const loadedNet = await loadLogoBuffer('/images/corretoras/net4life-logo.png');
    logoBuffer = loadedNet.buffer;
    logoMimeType = loadedNet.mime;
  }
  // Se for qualquer outra corretora sem logo cadastrado, logoBuffer permanece null!

  return {
    id: corretora.id,
    razaoSocial: corretora.razao_social || whiteLabel.companyName || corretora.nome_fantasia || 'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA',
    nomeFantasia: corretora.nome_fantasia || whiteLabel.companyName || corretora.razao_social || 'NET4LIFE',
    cnpj: formatCnpj(corretora.cnpj) || '34.567.890/0001-12',
    susep: String(corretora.susep || whiteLabel.susep || '202058392').trim(),
    email: corretora.email || whiteLabel.companyEmail || 'contato@net4life.com.br',
    phone: formatPhone(corretora.phone || whiteLabel.companyPhone || '(48) 99139-4912'),
    enderecoFormatado,
    endereco: enderecoLinha || addr.street || 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05',
    bairro: addr.neighborhood || 'Santo Antônio de Lisboa',
    cep: addr.cep || '88050-000',
    cidade: addr.city || 'Florianópolis',
    uf: addr.state || 'SC',
    logoBuffer,
    logoMimeType,
  };
}
