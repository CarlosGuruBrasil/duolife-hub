import { renderContratoPdf } from '../src/lib/pdf-contract-generator';
import { CorretoraContratoInfo } from '../src/lib/corretora-resolver';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  console.log('Gerando PDF de teste com layout oficial...');

  // Carrega logo da NET4Life
  const logoPath = path.join(process.cwd(), 'public', 'images', 'corretoras', 'net4life-logo.png');
  let logoBuffer: Buffer | null = null;
  try {
    logoBuffer = await fs.readFile(logoPath);
  } catch (err) {
    console.warn('Não foi possível carregar a logo local:', err);
  }

  const mockCorretora: CorretoraContratoInfo = {
    id: 'corretora_net4life_001',
    razaoSocial: 'Net4life Corretora de Seguros Ltda',
    nomeFantasia: 'NET4Life Corretora de Seguros',
    cnpj: '07.351.909/0001-33',
    susep: '202018702',
    email: 'contato@net4life.com.br',
    phone: '+55 (11) 91177-1319',
    enderecoFormatado: 'Rod. José Carlos Daux, 8600 - Bloco 03 Sala 05, Santo Antônio de Lisboa, Florianópolis/SC',
    logoBuffer,
    logoMimeType: 'image/png',
  };

  const mockCotacao = {
    id: 'prop-2026-98421',
    client_name: 'Dr. Carlos Eduardo Santos de Souza',
    client_cpf_cnpj: '123.456.789-00',
    client_email: 'carlos.eduardo@souzaadvocacia.com.br',
    client_phone: '(48) 99123-4567',
  };

  const mockClientData = {
    dataNascto: '1988-04-12',
    oab: '45.892/SC',
    logradouro: 'Avenida Jornalista Rubens de Arruda Ramos',
    numero: '1850',
    complemento: 'Conjunto 601 - Edifício Blue Tower',
    bairro: 'Centro',
    cidade: 'Florianópolis',
    uf: 'SC',
    cep: '88015-700',
    dataAtividade: '2012-03-01',
    escritorioAssociado: 'Souza & Duarte Sociedade de Advogados',
    titularidade: 'Sócio Coordenador',
    ppeCargos: 'Não',
    atuacao: ['Direito Civil e Contratos', 'Direito Empresarial', 'Direito Tributário', 'Fusões e Aquisições'],
    seguradora: 'Porto Seguro Cia de Seguros Gerais',
    dataRetroativa: '2020-05-15',
    valorCobertura: 'Plano Ouro Especial - LMG R$ 500.000,00',
    planoFranquia: 'R$ 5.000,00 por sinistro',
    parcela: '6',
    valorParcela: 420.50,
  };

  const pdfResult = await renderContratoPdf({
    cotacao: mockCotacao,
    clientData: mockClientData,
    corretora: mockCorretora,
    valorTotal: 2523.00,
    qtdParcelas: 6,
    valorParcela: 420.50,
    valorTotalComJuros: 2523.00,
  });

  // Salva no diretório do projeto
  const projectOutputPath = path.join(process.cwd(), 'contrato_exemplo_layout.pdf');
  await fs.writeFile(projectOutputPath, pdfResult.buffer);

  // Salva também na Área de Trabalho (Desktop) para fácil abertura do usuário
  const desktopOutputPath = 'C:\\Users\\Windows 10\\Desktop\\contrato_exemplo_layout.pdf';
  try {
    await fs.writeFile(desktopOutputPath, pdfResult.buffer);
    console.log('Salvo no Desktop:', desktopOutputPath);
  } catch (err) {
    console.warn('Não foi possível salvar no Desktop:', err);
  }

  console.log('PDF gerado com sucesso!');
  console.log('Arquivo:', projectOutputPath);
  console.log('Tamanho:', (pdfResult.buffer.length / 1024).toFixed(1) + ' KB');
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
