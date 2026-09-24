import fs from 'fs/promises';
import path from 'path';
import { renderContratoPdf } from '../src/lib/pdf-contract-generator';

async function main() {
  console.log('Gerando contrato modelo KEV Seguros + DuoLife com dados fictícios...');

  // Carrega logo da Net4Life
  let logoBuffer: Buffer | null = null;
  try {
    logoBuffer = await fs.readFile(path.join(process.cwd(), 'public', 'images', 'corretoras', 'net4life-logo.png'));
  } catch (e) {
    console.warn('Logo net4life não encontrado, usando fallback');
  }

  const corretora = {
    id: 'corretora_net4life_001',
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
    logoBuffer,
    logoMimeType: 'image/png' as const,
  };

  const cotacao = {
    id: '1007800004009',
    client_name: 'Adriana Chagas',
    client_cpf_cnpj: '902.576.269-72',
    client_email: 'adriana.chagas@advocacia.com.br',
    client_phone: '(48) 99139-4912',
  };

  const clientData = {
    profissao: 'Advogado',
    atividade: 'ADVOGADO',
    tipoDePlano: 'Advocacia',
    cobertura: '500.000,00',
    franquia: '3.000,00',
    dataInicio: '2026-08-28',
    dataPrimeiraParcela: '2026-08-15',
    retroatividade: '28/08/2025',
    formaPagamento: 'Boleto bancário',
    parcela: 6,
    premioLiquido: 806.72,
    iof: 64.28,
  };

  const valorTotal = 871.0;
  const qtdParcelas = 6;
  const valorParcela = 155.5;
  const valorTotalComJuros = 871.0;

  const result = await renderContratoPdf({
    cotacao,
    clientData,
    corretora,
    valorTotal,
    qtdParcelas,
    valorParcela,
    valorTotalComJuros,
  });

  // Salva no Desktop do usuário
  const desktopPath = path.join('C:', 'Users', 'Windows 10', 'Desktop', 'proposta_modelo_duolife.pdf');
  await fs.writeFile(desktopPath, result.buffer);
  console.log(`Documento salvo com sucesso no Desktop: ${desktopPath} (${result.buffer.length} bytes)`);

  // Salva cópia em temp/
  const tempPath = path.join(process.cwd(), 'temp', 'proposta_modelo_duolife.pdf');
  await fs.writeFile(tempPath, result.buffer);
  console.log(`Cópia salva em: ${tempPath}`);
}

main().catch((err) => {
  console.error('Erro ao gerar documento:', err);
  process.exit(1);
});
