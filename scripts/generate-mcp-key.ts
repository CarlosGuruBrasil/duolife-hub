import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from '../src/lib/pg';
import { hashApiKey } from '../src/lib/mcp/security';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const cwd = process.cwd();
loadEnvFile(path.join(cwd, '.env.local'));
loadEnvFile(path.join(cwd, '.env'));

const ALL_SCOPES = [
  'insurance:catalog:read',
  'insurance:quote',
  'insurance:sale:create',
  'insurance:sale:read',
  'insurance:contract:create',
  'insurance:payment:read',
];

async function generateMcpApiKey(name: string, isProduction = true) {
  const prefix = isProduction ? 'dlmcp_live_' : 'dlmcp_test_';
  const randomSecret = crypto.randomBytes(24).toString('hex');
  const fullToken = `${prefix}${randomSecret}`;
  const tokenHash = hashApiKey(fullToken);
  const keyPrefix = fullToken.slice(0, 16);

  console.log('================================================================');
  console.log(`   GERADOR DE CHAVES MCP — DUOLIFE HUB`);
  console.log('================================================================\n');

  try {
    const [inserted] = await sql<any[]>`
      INSERT INTO mcp_api_keys (
        name,
        key_prefix,
        key_hash,
        scopes,
        rate_limit_per_minute,
        is_active,
        created_at
      )
      VALUES (
        ${name},
        ${keyPrefix},
        ${tokenHash},
        ${ALL_SCOPES},
        300,
        true,
        NOW()
      )
      RETURNING id, name, key_prefix, scopes, rate_limit_per_minute, created_at
    `;

    console.log('✔ Chave registrada com sucesso no banco de dados PostgreSQL!');
    console.log(`ID da Chave:     ${inserted.id}`);
    console.log(`Nome / Cliente:  ${inserted.name}`);
    console.log(`Prefixo Público: ${inserted.key_prefix}...`);
    console.log(`Escopos Ativos:  ${inserted.scopes.join(', ')}`);
    console.log(`Rate Limit:      ${inserted.rate_limit_per_minute} req/min\n`);
  } catch (err: any) {
    console.warn('⚠ Nota: Não foi possível conectar ao PostgreSQL local para persistência imediata.');
    console.warn(`Detalhes: ${err.message || err}\n`);
    console.log('SQL para execução manual no banco de dados de produção (Coolify/Postgres):');
    console.log(`
INSERT INTO mcp_api_keys (id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, is_active, created_at)
VALUES (
  gen_random_uuid()::text,
  '${name}',
  '${keyPrefix}',
  '${tokenHash}',
  ARRAY['insurance:catalog:read', 'insurance:quote', 'insurance:sale:create', 'insurance:sale:read', 'insurance:contract:create', 'insurance:payment:read'],
  300,
  true,
  NOW()
);
    `);
  }

  console.log('----------------------------------------------------------------');
  console.log('CHAVE DE ACESSO MCP (GUARDE COM SEGURANÇA):');
  console.log(fullToken);
  console.log('----------------------------------------------------------------\n');
  console.log('Cabeçalho de Requisição HTTP:');
  console.log(`Authorization: Bearer ${fullToken}\n`);
  console.log('Exemplo de Conexão (curl):');
  console.log(`curl -X POST https://hub.duolife.com.br/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${fullToken}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`);
  console.log('================================================================');
}

const clientName = process.argv[2] || 'Agente de Vendas WhatsApp Oficial';
generateMcpApiKey(clientName, true).catch(console.error);
