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

const cwd = process.cwd();
loadEnvFile(path.join(cwd, '.env.local'));
loadEnvFile(path.join(cwd, '.env'));

export const dadosClientePhilippe = {
  nome: 'Philippe de Castro Lourenço',
  cpf: '118.336.267-61',
  cpfCnpj: '11833626761',
  email: 'philippecastro1@gmail.com',
  celular: '24988160816',
  dataNascto: '1988-09-04',
  cep: '25610011',
  logradouro: 'Rua João Caetano',
  numero: '179',
  bairro: 'Caxambu',
  cidade: 'Petrópolis',
  uf: 'RJ',
  oab: '197967',
  oabUf: 'RJ',
  tipo: '100k',
  plano: '100k',
  valor: 310.0,
  valorTotal: 310.0,
  valorParcela: 310.0,
  parcela: 1,
  qtdParcelas: 1,
  formaPagamento: 'BOLETO',
  status: 'Quitado',
  statusGeral: 'Negócio Fechado',
  statusPagamento: 'Quitado',
  statusCliente: 'Vigente',
  token: '0d3fdf72-3d2a-4001-aa14-3c80f27f3665',
  urlProposta: 'https://app.zapsign.com.br/verificar/0d3fdf72-3d2a-4001-aa14-3c80f27f3665',
  clienteId: 'cus_000214920226',
  checkoutId: 'cus_000214920226',
  inicioVigencia: '2026-11-05',
  dataPagamento: '2026-11-05',
};

async function dispararImportacao(apiKey?: string, baseUrl = 'https://duolife.com.br') {
  const token = apiKey || process.env.WIX_INTEGRATION_KEY || process.env.INTEGRATION_API_KEY || 'dlmcp_live_dev_test_key_001_secret';
  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/integracao/wix/cotacoes/sincronizar-venda`;

  console.log(`🚀 Disparando importação de venda para: ${url}`);
  console.log(`📋 Cliente: ${dadosClientePhilippe.nome} | CPF: ${dadosClientePhilippe.cpf}`);
  console.log(`📄 Token ZapSign: ${dadosClientePhilippe.token}`);
  console.log(`💳 Asaas Customer/Checkout: ${dadosClientePhilippe.clienteId}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(dadosClientePhilippe),
    });

    console.log(`\nHTTP Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { rawText: text.slice(0, 500) };
    }

    console.log('Resposta da API:');
    console.log(JSON.stringify(json, null, 2));

    if (json.ok && json.cotacaoId) {
      console.log('\n🎉 Importação realizada com sucesso!');
      console.log(`- Cotação ID: ${json.cotacaoId}`);
      console.log(`- Cliente ID: ${json.clientId}`);
      console.log(`- Apólice/Venda ID: ${json.saleId}`);
      console.log(`- Status: ${json.status}`);
    }
    return json;
  } catch (err: any) {
    console.error('❌ Erro na requisição:', err?.message || err);
    throw err;
  }
}

const args = process.argv.slice(2);
const customKey = args[0];
const customUrl = args[1];

dispararImportacao(customKey, customUrl).catch(() => process.exit(1));
