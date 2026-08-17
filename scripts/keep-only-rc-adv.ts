import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL não configurada.');

const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  console.log('🧹 Removendo produtos que não existem no catálogo oficial...');

  // 1. Apaga dependências de parceiros para produtos que não sejam RC-ADV-001
  await sql`
    DELETE FROM partner_product_availability
    WHERE product_id IN (
      SELECT id FROM products WHERE code != 'RC-ADV-001'
    )
  `;

  // 2. Apaga todos os produtos exceto RC-ADV-001
  const deleted = await sql`
    DELETE FROM products
    WHERE code != 'RC-ADV-001'
    RETURNING code, name
  `;

  console.log(`🗑️ Removidos ${deleted.length} produtos secundários/inexistentes:`);
  deleted.forEach(d => console.log(` - [${d.code}] ${d.name}`));

  // 3. Garante que o produto principal RC Advogados está configurado com 100% de precisão
  const [productAdv] = await sql`
    INSERT INTO products (
      name, code, category, product_type, integration_type, insurer_name, insurer_cnpj,
      description, public_title, target_audience, base_commission_rate, min_premium,
      flow_key, pricing_strategy, policy_prefix, is_active, is_quoteable, is_contractable,
      is_payable, validity_days, sale_recognition, renewal_enabled, requires_underwriting,
      required_documents
    ) VALUES (
      'RC Profissional — Advogados & Escritórios',
      'RC-ADV-001',
      'Responsabilidade Civil',
      'insurance',
      'full_journey',
      'KEV Seguros',
      '14.862.008/0001-23',
      'Seguro de Responsabilidade Civil Profissional para Advogados. Proteção contra falhas de prazos judiciais, erros em peças processuais e custos de defesa na OAB. Coberturas de R$ 100k até R$ 3 Milhões.',
      'Seguro RC Profissional Advogados',
      'Advogados autônomos e escritórios de advocacia',
      15.00,
      516.67,
      'rc_professional_v1',
      'rc_wix_planos_v1',
      'DL-RC-ADV',
      true, true, true, true, 365, 'on_payment', true, false,
      '["Comprovante de Inscrição na OAB", "Documento de Identidade com CPF"]'::jsonb
    )
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      integration_type = 'full_journey',
      insurer_name = EXCLUDED.insurer_name,
      description = EXCLUDED.description,
      min_premium = 516.67,
      is_active = true,
      is_quoteable = true
    RETURNING id, name, code
  `;

  // 4. Vincula o produto aos parceiros ativos
  await sql`
    INSERT INTO partner_product_availability (partner_id, product_id, is_active)
    SELECT pa.id, ${productAdv.id}, true
    FROM partners pa
    WHERE pa.status = 'active'
    ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true
  `;

  console.log('✅ Catálogo limpo! Apenas o produto oficial "RC Profissional — Advogados & Escritórios" está ativo no sistema.');
}

main()
  .catch((err) => {
    console.error('❌ Erro ao limpar catálogo:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
