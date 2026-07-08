import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

async function run() {
  try {
    const [existing] = await sql`SELECT id FROM partners WHERE razao_social = 'DuoLife Venda Direta'`;
    if (existing) {
      console.log('DuoLife partner already exists:', existing.id);
      process.exit(0);
    }

    const [partner] = await sql`
      INSERT INTO partners (
        razao_social, nome_fantasia, email, status, metadata
      ) VALUES (
        'DuoLife Venda Direta', 'DuoLife', 'contato@duolife.com.br', 'active', '{"slug": "duolife"}'
      ) RETURNING id
    `;
    console.log('Created DuoLife partner:', partner.id);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.end();
  }
}

run();
