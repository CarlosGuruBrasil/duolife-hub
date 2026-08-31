import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env.local');
  } catch {}
}

const localUrl = process.env.LOCAL_DATABASE_URL || 'postgres://duolife:local_dev_password@localhost:5433/duolife_db';
const prodUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;

if (!prodUrl) {
  console.error('❌ Erro: DATABASE_URL ou PROD_DATABASE_URL é obrigatório para sincronizar com produção.');
  process.exit(1);
}

async function syncLocalToProd() {
  console.log('🚀 Iniciando sincronização em lote do banco local para produção...');
  console.log(`Local: ${localUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Prod:  ${prodUrl.replace(/:[^:@]+@/, ':****@')}`);

  const local = postgres(localUrl, { max: 2, connect_timeout: 10 });
  const prod = postgres(prodUrl, { max: 5, connect_timeout: 10 });

  try {
    // 1. Sincronizar insurance_clients
    console.log('\n📦 1. Sincronizando insurance_clients...');
    const localClients = await local`
      SELECT id, document_number, document_type, full_name, email, phone, birth_date, metadata, created_at, updated_at
      FROM insurance_clients
    `;
    console.log(`Total de clientes locais: ${localClients.length}`);

    const clientRows = localClients.map((c) => ({
      id: c.id,
      document_number: c.document_number,
      document_type: c.document_type,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      birth_date: c.birth_date,
      metadata: c.metadata || {},
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    const batchSize = 100;
    for (let i = 0; i < clientRows.length; i += batchSize) {
      const batch = clientRows.slice(i, i + batchSize);
      await prod`
        INSERT INTO insurance_clients ${prod(batch)}
        ON CONFLICT (id) DO UPDATE SET
          document_number = EXCLUDED.document_number,
          document_type = EXCLUDED.document_type,
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          birth_date = EXCLUDED.birth_date,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
      `;
      process.stdout.write(`- Clientes sincronizados: ${Math.min(i + batchSize, clientRows.length)}/${clientRows.length}\n`);
    }
    console.log(`✅ insurance_clients sincronizados com sucesso.`);

    // 2. Sincronizar leads
    console.log('\n📦 2. Sincronizando leads...');
    const localLeads = await local`
      SELECT id, partner_id, external_id, document_number, nome, email, telefone, origem,
             status, product_id, score, temperatura, data_cadastro, data_atualizacao, raw, synced_at, source_system, status_cliente
      FROM leads
    `;
    console.log(`Total de leads locais: ${localLeads.length}`);

    const leadRows = localLeads.map((l) => ({
      id: l.id,
      partner_id: l.partner_id,
      external_id: l.external_id,
      document_number: l.document_number,
      nome: l.nome,
      email: l.email,
      telefone: l.telefone,
      origem: l.origem,
      status: l.status,
      product_id: l.product_id,
      score: l.score,
      temperatura: l.temperatura,
      data_cadastro: l.data_cadastro,
      data_atualizacao: l.data_atualizacao,
      raw: l.raw || null,
      synced_at: l.synced_at,
      source_system: l.source_system,
      status_cliente: l.status_cliente,
    }));

    for (let i = 0; i < leadRows.length; i += batchSize) {
      const batch = leadRows.slice(i, i + batchSize);
      await prod`
        INSERT INTO leads ${prod(batch)}
        ON CONFLICT (id) DO UPDATE SET
          partner_id = EXCLUDED.partner_id,
          external_id = EXCLUDED.external_id,
          document_number = EXCLUDED.document_number,
          nome = EXCLUDED.nome,
          email = EXCLUDED.email,
          telefone = EXCLUDED.telefone,
          origem = EXCLUDED.origem,
          status = EXCLUDED.status,
          product_id = EXCLUDED.product_id,
          score = EXCLUDED.score,
          temperatura = EXCLUDED.temperatura,
          data_cadastro = EXCLUDED.data_cadastro,
          data_atualizacao = EXCLUDED.data_atualizacao,
          raw = EXCLUDED.raw,
          synced_at = EXCLUDED.synced_at,
          source_system = EXCLUDED.source_system,
          status_cliente = EXCLUDED.status_cliente
      `;
      process.stdout.write(`- Leads sincronizados: ${Math.min(i + batchSize, leadRows.length)}/${leadRows.length}\n`);
    }
    console.log(`✅ leads sincronizados com sucesso.`);

    // 3. Sincronizar cotacoes
    console.log('\n📦 3. Sincronizando cotacoes...');
    const localCotacoes = await local`
      SELECT id, client_id, partner_id, partner_user_id, product_id, lead_id, client_name,
             client_cpf_cnpj, client_email, client_phone, client_data, importancia_segurada,
             premio_calculado, premio_final, status, flow_type, source_token, external_ref,
             valid_until, notes, metadata, created_at, updated_at, is_renewal, renewed_from_cotacao_id
      FROM cotacoes
    `;
    console.log(`Total de cotações locais: ${localCotacoes.length}`);

    const cotacaoRows = localCotacoes.map((c) => ({
      id: c.id,
      client_id: c.client_id,
      partner_id: c.partner_id,
      partner_user_id: c.partner_user_id,
      product_id: c.product_id,
      lead_id: c.lead_id,
      client_name: c.client_name,
      client_cpf_cnpj: c.client_cpf_cnpj,
      client_email: c.client_email,
      client_phone: c.client_phone,
      client_data: c.client_data || null,
      importancia_segurada: c.importancia_segurada,
      premio_calculado: c.premio_calculado,
      premio_final: c.premio_final,
      status: c.status,
      flow_type: c.flow_type,
      source_token: c.source_token,
      external_ref: c.external_ref,
      valid_until: c.valid_until,
      notes: c.notes,
      metadata: c.metadata || null,
      created_at: c.created_at,
      updated_at: c.updated_at,
      is_renewal: c.is_renewal,
      renewed_from_cotacao_id: c.renewed_from_cotacao_id,
    }));

    if (cotacaoRows.length > 0) {
      await prod`
        INSERT INTO cotacoes ${prod(cotacaoRows)}
        ON CONFLICT (id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          partner_id = EXCLUDED.partner_id,
          partner_user_id = EXCLUDED.partner_user_id,
          product_id = EXCLUDED.product_id,
          lead_id = EXCLUDED.lead_id,
          client_name = EXCLUDED.client_name,
          client_cpf_cnpj = EXCLUDED.client_cpf_cnpj,
          client_email = EXCLUDED.client_email,
          client_phone = EXCLUDED.client_phone,
          client_data = EXCLUDED.client_data,
          importancia_segurada = EXCLUDED.importancia_segurada,
          premio_calculado = EXCLUDED.premio_calculado,
          premio_final = EXCLUDED.premio_final,
          status = EXCLUDED.status,
          flow_type = EXCLUDED.flow_type,
          source_token = EXCLUDED.source_token,
          external_ref = EXCLUDED.external_ref,
          valid_until = EXCLUDED.valid_until,
          notes = EXCLUDED.notes,
          metadata = EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at,
          is_renewal = EXCLUDED.is_renewal,
          renewed_from_cotacao_id = EXCLUDED.renewed_from_cotacao_id
      `;
    }
    console.log(`✅ cotacoes sincronizadas com sucesso.`);

    // 4. Verificação final de contagem em produção
    console.log('\n--- CONTAGEM FINAL EM PRODUÇÃO ---');
    const [prodClientsCount] = await prod`SELECT count(*) FROM insurance_clients`;
    const [prodLeadsCount] = await prod`SELECT count(*) FROM leads`;
    const [prodCotacoesCount] = await prod`SELECT count(*) FROM cotacoes`;

    console.log(`- insurance_clients em produção: ${prodClientsCount.count}`);
    console.log(`- leads em produção:             ${prodLeadsCount.count}`);
    console.log(`- cotacoes em produção:          ${prodCotacoesCount.count}`);

    console.log('\n🎉 Sincronização com o banco de produção concluída com 100% de sucesso!');
  } finally {
    await local.end({ timeout: 5 });
    await prod.end({ timeout: 5 });
  }
}

syncLocalToProd().catch((err) => {
  console.error('❌ Erro na sincronização:', err);
  process.exit(1);
});
