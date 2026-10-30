import fs from 'fs/promises';
import path from 'path';
import { sql } from './pg';
import { parseJsonbField } from './json-safe';
import { logger } from './logger';
import { resolveHierarchicalWhiteLabel } from './white-label';

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
  isNet4Life?: boolean;
  website?: string;
  footerText?: string;
  primaryColor?: string;
  isWhiteLabel?: boolean;
}

/**
 * Identifica se a corretora é a Net4Life (Corretora Master do ecossistema).
 */
export function isNet4LifeCorretora(corretora?: {
  id?: string | null;
  cnpj?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
} | null): boolean {
  if (!corretora) return false;
  const id = String(corretora.id || '').toLowerCase();
  const cnpjClean = String(corretora.cnpj || '').replace(/\D/g, '');
  const nome = String(corretora.nomeFantasia || corretora.razaoSocial || '').toLowerCase();
  return (
    id === 'corretora_net4life_001' ||
    id === 'default' ||
    cnpjClean.includes('07351909000133') ||
    cnpjClean.includes('34567890000112') ||
    nome.includes('net4life') ||
    nome.includes('netforlife')
  );
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
  // Busca a cotação e resolve os dados do parceiro e corretora por precedência:
  // 1. cotacoes.corretora_id
  // 2. partners.corretora_id (via cotacoes.partner_id)
  // 3. Primeira corretora ativa no sistema
  const [row] = await sql<{
    corretora_id: string | null;
    partner_id: string | null;
    partner_corretora_id: string | null;
    partner_metadata: any;
    partner_name: string | null;
    partner_company_name: string | null;
    partner_document: string | null;
    partner_email: string | null;
    partner_phone: string | null;
    partner_address: any;
  }[]>`
    SELECT 
      c.corretora_id,
      c.partner_id,
      p.corretora_id as partner_corretora_id,
      p.metadata as partner_metadata,
      p.name as partner_name,
      p.company_name as partner_company_name,
      p.document as partner_document,
      p.email as partner_email,
      p.phone as partner_phone,
      p.address as partner_address
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
      isNet4Life: true,
      website: 'net4life.com.br',
      footerText: 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05, Santo Antônio de Lisboa, Florianópolis/SC, CEP: 88050-000',
      primaryColor: '#0e4a5a',
      isWhiteLabel: false,
    };
  }

  // Resolução White-Label em cascata (Parceiro -> Corretora Mãe -> Defaults)
  const hierarchicalWl = resolveHierarchicalWhiteLabel(row?.partner_metadata, corretora.metadata);
  const addrCorretora = parseJsonbField<Record<string, any>>(corretora.address);
  const addrPartner = parseJsonbField<Record<string, any>>(row?.partner_address);
  const addr = (addrPartner?.street || addrPartner?.city) ? addrPartner : addrCorretora;

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

  // 1. Resolução do logotipo oficial (Prioridade: White-Label -> Base64 Corretora -> Net4Life Padrão)
  let logoBuffer: Buffer | null = null;
  let logoMimeType: 'image/png' | 'image/jpeg' | null = null;

  // Prioridade 1: Logotipo configurado no White-Label hierárquico (URL ou Data URI)
  if (hierarchicalWl.logoUrl) {
    const loaded = await loadLogoBuffer(hierarchicalWl.logoUrl);
    logoBuffer = loaded.buffer;
    logoMimeType = loaded.mime;
  }

  // Prioridade 2: Imagem armazenada diretamente na coluna logo_base64 no banco de dados da corretora
  if (!logoBuffer && corretora.logo_base64) {
    try {
      logoBuffer = Buffer.from(corretora.logo_base64, 'base64');
      logoMimeType = corretora.logo_mime_type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    } catch (e) {
      logger.warn({ err: e, corretoraId: corretora.id }, 'corretora_resolver.logo_base64_error');
    }
  }

  // Prioridade 3: Se for a própria corretora NET4Life, pode usar o logo padrão local se não tiver outro
  const isNet4Life = isNet4LifeCorretora({
    id: corretora.id,
    cnpj: corretora.cnpj,
    nomeFantasia: corretora.nome_fantasia,
    razaoSocial: corretora.razao_social,
  });
  if (!logoBuffer && isNet4Life) {
    const loadedNet = await loadLogoBuffer('/images/corretoras/net4life-logo.png');
    logoBuffer = loadedNet.buffer;
    logoMimeType = loadedNet.mime;
  }

  const isWhiteLabelActive = Boolean(
    hierarchicalWl.companyName ||
    hierarchicalWl.logoUrl ||
    row?.partner_name ||
    row?.partner_company_name
  );

  const razaoSocialResolvida =
    hierarchicalWl.companyName ||
    row?.partner_company_name ||
    corretora.razao_social ||
    corretora.nome_fantasia ||
    'NETFORLIFE TECNOLOGIA EM GESTÃO E CORRETAGEM DE SEGUROS LTDA';

  const nomeFantasiaResolvido =
    hierarchicalWl.companyName ||
    row?.partner_name ||
    corretora.nome_fantasia ||
    corretora.razao_social ||
    'NET4LIFE';

  const cnpjResolvido = formatCnpj(row?.partner_document || corretora.cnpj) || '34.567.890/0001-12';
  const susepResolvida = String(hierarchicalWl.susep || corretora.susep || '202058392').trim();
  const emailResolvido = hierarchicalWl.companyEmail || row?.partner_email || corretora.email || 'contato@net4life.com.br';
  const phoneResolvido = formatPhone(hierarchicalWl.companyPhone || row?.partner_phone || corretora.phone || '(48) 99139-4912');
  const websiteResolvido = hierarchicalWl.companyWebsite || (isNet4Life ? 'net4life.com.br' : 'duolife.com.br');
  const footerTextResolvido = hierarchicalWl.footerText || enderecoFormatado;
  const primaryColorResolvida = hierarchicalWl.primaryColor || '#0e4a5a';

  return {
    id: corretora.id,
    razaoSocial: razaoSocialResolvida,
    nomeFantasia: nomeFantasiaResolvido,
    cnpj: cnpjResolvido,
    susep: susepResolvida,
    email: emailResolvido,
    phone: phoneResolvido,
    enderecoFormatado,
    endereco: enderecoLinha || addr.street || 'Rod. José Carlos Daux, 8600, Bloco 03, Sala 05',
    bairro: addr.neighborhood || 'Santo Antônio de Lisboa',
    cep: addr.cep || '88050-000',
    cidade: addr.city || 'Florianópolis',
    uf: addr.state || 'SC',
    logoBuffer,
    logoMimeType,
    isNet4Life,
    website: websiteResolvido,
    footerText: footerTextResolvido,
    primaryColor: primaryColorResolvida,
    isWhiteLabel: isWhiteLabelActive,
  };
}
