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
import { ensureSchema } from '../src/lib/schema';
import { fetchAllWixImport1Items } from '../src/lib/wix-compare';
import { normalizeDigits, normalizeMaybeString } from '../src/lib/wix-sync';

async function main() {
  console.log('🚀 Iniciando consolidação e importação completa de todos os 1.373 registros do Wix...');
  await ensureSchema();

  const wixData = await fetchAllWixImport1Items();
  const wixItems = wixData.items;
  console.log(`Total de itens do Wix Import1 obtidos: ${wixItems.length} (Fonte: ${wixData.source})`);

  let leadsInserted = 0;
  let leadsUpdated = 0;
  let clientsCreated = 0;
  let clientsUpdated = 0;

  // Agrupa os itens do Wix por CPF
  const wixByCpf = new Map<string, typeof wixItems>();

  for (const item of wixItems) {
    const raw = item.rawData || {};
    const doc =
      item.documentNumber ||
      normalizeDigits(raw.cpf) ||
      normalizeDigits(raw.cnpj) ||
      normalizeDigits(raw.documentNumber) ||
      normalizeDigits(raw.documento) ||
      normalizeDigits(raw.cpfCnpj) ||
      `WIX-${item.id}`;

    if (!wixByCpf.has(doc)) {
      wixByCpf.set(doc, []);
    }
    wixByCpf.get(doc)!.push(item);

    // 1. Garante que CADA um dos 1.373 registros exista na tabela de LEADS por external_id
    const name = item.name || normalizeMaybeString(raw.nome) || normalizeMaybeString(raw.name) || normalizeMaybeString(raw.nomeExibido) || null;
    const email = item.email ? item.email.toLowerCase().trim() : (normalizeMaybeString(raw.email)?.toLowerCase().trim() || null);
    const phone = item.phone ? normalizeDigits(item.phone) : (normalizeDigits(raw.celular) || normalizeDigits(raw.telefone) || null);
    const statusCliente = item.statusCliente || normalizeMaybeString(raw.statusCliente) || normalizeMaybeString(raw.StatusCliente) || null;
    const status = item.status || statusCliente || normalizeMaybeString(raw.statusGeral) || 'novo';
    const wixCreatedAt = item.createdDate ? new Date(item.createdDate) : new Date();

    const [existingLead] = await sql`
      SELECT id FROM leads WHERE external_id = ${item.id} LIMIT 1
    `;

    if (existingLead) {
      await sql`
        UPDATE leads
        SET
          document_number = COALESCE(${doc.startsWith('WIX-') ? null : doc}::text, document_number),
          nome = COALESCE(${name}::text, nome),
          email = COALESCE(${email}::text, email),
          telefone = COALESCE(${phone}::text, telefone),
          status = COALESCE(${status}::text, status),
          status_cliente = COALESCE(${statusCliente}::text, status_cliente),
          raw = ${JSON.stringify({ sourceCollection: 'Import1', wix: raw })}::jsonb,
          synced_at = NOW(),
          data_atualizacao = NOW()
        WHERE id = ${existingLead.id}
      `;
      leadsUpdated++;
    } else {
      await sql`
        INSERT INTO leads (
          external_id,
          document_number,
          nome,
          email,
          telefone,
          origem,
          status,
          status_cliente,
          raw,
          synced_at,
          source_system,
          data_cadastro,
          data_atualizacao
        )
        VALUES (
          ${item.id},
          ${doc.startsWith('WIX-') ? null : doc}::text,
          ${name}::text,
          ${email}::text,
          ${phone}::text,
          'wix',
          ${status},
          ${statusCliente}::text,
          ${JSON.stringify({ sourceCollection: 'Import1', wix: raw })}::jsonb,
          NOW(),
          'wix',
          ${wixCreatedAt},
          NOW()
        )
      `;
      leadsInserted++;
    }
  }

  console.log(`✅ Tabela LEADS atualizada: ${leadsInserted} inseridos, ${leadsUpdated} atualizados (Total leads: ${leadsInserted + leadsUpdated})`);

  // 2. Garante que cada CPF único tenha seu registro consolidado em INSURANCE_CLIENTS com todo o histórico
  for (const [doc, items] of wixByCpf.entries()) {
    // Ordena do mais recente para o mais antigo
    items.sort((a, b) => {
      const dateA = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      const dateB = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      return dateB - dateA;
    });

    const latest = items[0];
    const raw = latest.rawData || {};
    const name = latest.name || normalizeMaybeString(raw.nome) || normalizeMaybeString(raw.name) || normalizeMaybeString(raw.nomeExibido) || `Cliente ${doc}`;
    const email = latest.email ? latest.email.toLowerCase().trim() : (normalizeMaybeString(raw.email)?.toLowerCase().trim() || null);
    const phone = latest.phone ? normalizeDigits(latest.phone) : (normalizeDigits(raw.celular) || normalizeDigits(raw.telefone) || null);
    const statusCliente = latest.statusCliente || normalizeMaybeString(raw.statusCliente) || normalizeMaybeString(raw.StatusCliente) || null;
    const status = latest.status || statusCliente || normalizeMaybeString(raw.statusGeral) || null;
    const partnerCode = latest.partnerCode || normalizeMaybeString(raw.codigoVenda) || normalizeMaybeString(raw.codigoParceiro) || null;
    const wixCreatedAt = latest.createdDate ? new Date(latest.createdDate) : new Date();

    const wixHistory = items.map((it) => ({
      wixId: it.id,
      createdDate: it.createdDate,
      status: it.status,
      statusCliente: it.statusCliente,
      raw: it.rawData,
    }));

    const metadataPayload = {
      source: 'wix',
      collectionId: 'Import1',
      externalId: latest.id,
      allWixIds: items.map((it) => it.id),
      wixRecordsCount: items.length,
      status,
      statusCliente,
      partnerCode,
      lastSyncedAt: new Date().toISOString(),
      wixHistory,
      wix: raw,
    };

    const docType = doc.length > 11 ? 'cnpj' : 'cpf';

    const [existingClient] = await sql`
      SELECT id FROM insurance_clients WHERE document_number = ${doc} LIMIT 1
    `;

    if (existingClient) {
      await sql`
        UPDATE insurance_clients
        SET
          full_name = COALESCE(${name}::text, full_name),
          email = COALESCE(${email}::text, email),
          phone = COALESCE(${phone}::text, phone),
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadataPayload)}::jsonb,
          updated_at = NOW()
        WHERE id = ${existingClient.id}
      `;
      clientsUpdated++;
    } else {
      await sql`
        INSERT INTO insurance_clients (
          document_number,
          document_type,
          full_name,
          email,
          phone,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          ${doc},
          ${docType},
          ${name},
          ${email}::text,
          ${phone}::text,
          ${JSON.stringify(metadataPayload)}::jsonb,
          ${wixCreatedAt},
          NOW()
        )
      `;
      clientsCreated++;
    }
  }

  console.log(`✅ Tabela INSURANCE_CLIENTS consolidada: ${clientsCreated} criados, ${clientsUpdated} atualizados (Total CPFs únicos: ${wixByCpf.size})`);
  
  const [totalClients] = await sql`SELECT count(*) FROM insurance_clients`;
  const [totalLeads] = await sql`SELECT count(*) FROM leads`;
  console.log(`\n🎉 Resumo Final no Banco de Dados:`);
  console.log(`- Clientes Únicos (insurance_clients): ${totalClients.count}`);
  console.log(`- Total de Leads/Envios Importados (leads): ${totalLeads.count}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
