import fs from 'node:fs';
import path from 'node:path';

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

loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

import { sql } from '../src/lib/pg';

async function main() {
  try {
    console.log('--- Buscando cotações recentes (geradas ontem/hoje ou com contrato assinado) ---');
    const recentQuotes = await sql`
      SELECT 
        c.id,
        c.client_name,
        c.client_cpf_cnpj,
        c.status,
        c.premio_final,
        c.premio_calculado,
        c.created_at,
        c.updated_at,
        c.client_data->>'dataInicioVigencia' as data_inicio_vigencia,
        c.client_data->>'vigencia' as vigencia,
        c.client_data->>'assinadoEm' as assinado_em,
        c.client_data->>'checkoutId' as checkout_id,
        c.client_data->>'linkBoleto' as link_boleto,
        c.client_data->>'contratoGeradoEm' as contrato_gerado_em
      FROM cotacoes c
      ORDER BY c.updated_at DESC
      LIMIT 10
    `;

    console.log(JSON.stringify(recentQuotes, null, 2));

    console.log('\n--- Buscando documentos recentes na signature_documents ---');
    const sigDocs = await sql`
      SELECT 
        sd.id,
        sd.cotacao_id,
        sd.provider,
        sd.status,
        sd.external_document_id,
        sd.signed_file_url,
        sd.signed_at,
        sd.created_at,
        sd.updated_at
      FROM signature_documents sd
      ORDER BY sd.updated_at DESC
      LIMIT 10
    `;
    console.log(JSON.stringify(sigDocs, null, 2));

    console.log('\n--- Buscando eventos recentes de webhook (zapsign / asaas) ---');
    const webhookEvents = await sql`
      SELECT 
        we.id,
        we.provider,
        we.event_type,
        we.external_id,
        we.processed,
        we.error_message,
        we.created_at
      FROM webhook_events we
      ORDER BY we.created_at DESC
      LIMIT 10
    `;
    console.log(JSON.stringify(webhookEvents, null, 2));

    console.log('\n--- Buscando payment_orders recentes ---');
    const paymentOrders = await sql`
      SELECT 
        po.id,
        po.cotacao_id,
        po.status,
        po.amount_total,
        po.due_date,
        po.external_payment_id,
        po.created_at,
        po.updated_at
      FROM payment_orders po
      ORDER BY po.created_at DESC
      LIMIT 10
    `;
    console.log(JSON.stringify(paymentOrders, null, 2));

  } catch (err) {
    console.error('Erro na consulta:', err);
  } finally {
    process.exit(0);
  }
}

main();
