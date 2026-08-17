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
if (!databaseUrl) {
  throw new Error('DATABASE_URL não configurada.');
}

const sql = postgres(databaseUrl, { max: 1 });

const rcProducts = [
  {
    name: 'RC Profissional — Médicos & Profissionais da Saúde',
    code: 'RC-MED-001',
    category: 'Responsabilidade Civil',
    product_type: 'insurance',
    insurer_name: 'Akad Seguros',
    insurer_cnpj: '14.862.008/0001-23',
    description: 'Proteção completa contra reclamações de erro médico, procedimentos cirúrgicos, custos de defesa em conselhos de classe (CRM) e indenizações de terceiros.',
    public_title: 'Seguro RC Profissional Médicos',
    target_audience: 'Médicos de todas as especialidades, cirurgiões, residentes e clínicas médicas',
    base_commission_rate: 15.0,
    min_premium: 1500.0,
    flow_key: 'rc_professional_v1',
    pricing_strategy: 'rc_wix_planos_v1',
    policy_prefix: 'DL-RC-MED',
    is_active: true,
    is_quoteable: true,
    is_contractable: true,
    is_payable: true,
    validity_days: 365,
    sale_recognition: 'on_payment',
    renewal_enabled: true,
    requires_underwriting: false,
    required_documents: [
      'Comprovante de Inscrição CRM Ativo',
      'Documento de Identidade com CPF',
      'Ficha de Declaração de Saúde / Questionário de Risco',
    ],
  },
  {
    name: 'RC Profissional — Cirurgiões Dentistas',
    code: 'RC-ODONTO-001',
    category: 'Responsabilidade Civil',
    product_type: 'insurance',
    insurer_name: 'Akad Seguros',
    insurer_cnpj: '14.862.008/0001-23',
    description: 'Cobertura abrangente contra processos e reclamações por procedimentos odontológicos gerais, ortodontia, implantodontia e harmonização orofacial.',
    public_title: 'Seguro RC Profissional Odonto',
    target_audience: 'Cirurgiões dentistas, ortodontistas, implantodontistas e consultórios odontológicos',
    base_commission_rate: 15.0,
    min_premium: 980.0,
    flow_key: 'rc_professional_v1',
    pricing_strategy: 'rc_wix_planos_v1',
    policy_prefix: 'DL-RC-ODO',
    is_active: true,
    is_quoteable: true,
    is_contractable: true,
    is_payable: true,
    validity_days: 365,
    sale_recognition: 'on_payment',
    renewal_enabled: true,
    requires_underwriting: false,
    required_documents: [
      'Comprovante de Inscrição CRO Ativo',
      'Documento de Identidade com CPF',
      'Certificado de Especialização (se aplicável)',
    ],
  },
  {
    name: 'RC Profissional — Advogados & Escritórios',
    code: 'RC-ADV-001',
    category: 'Responsabilidade Civil',
    product_type: 'insurance',
    insurer_name: 'Akad Seguros',
    insurer_cnpj: '14.862.008/0001-23',
    description: 'Proteção financeira e jurídica contra perdas de prazos judiciais, erros de peça processual, falhas na prestação de consultoria e extravio de documentos.',
    public_title: 'Seguro RC Profissional Advogados',
    target_audience: 'Advogados autônomos, pareceristas e sociedades de advogados',
    base_commission_rate: 12.5,
    min_premium: 1200.0,
    flow_key: 'rc_professional_v1',
    pricing_strategy: 'rc_wix_planos_v1',
    policy_prefix: 'DL-RC-ADV',
    is_active: true,
    is_quoteable: true,
    is_contractable: true,
    is_payable: true,
    validity_days: 365,
    sale_recognition: 'on_payment',
    renewal_enabled: true,
    requires_underwriting: false,
    required_documents: [
      'Comprovante de Inscrição OAB Ativa',
      'Documento de Identidade com CPF',
      'Contrato Social do Escritório (se PJ)',
    ],
  },
  {
    name: 'RC Profissional — Engenheiros & Arquiteto',
    code: 'RC-ENG-001',
    category: 'Responsabilidade Civil',
    product_type: 'insurance',
    insurer_name: 'Akad Seguros',
    insurer_cnpj: '14.862.008/0001-23',
    description: 'Garantia para falhas em elaboração de projetos, cálculos estruturais, laudos técnicos, execução de obras e responsabilidade civil de ART/RRT.',
    public_title: 'Seguro RC Engenharia e Arquitetura',
    target_audience: 'Engenheiros civis, eletricistas, mecânicos, arquitetos e construtoras',
    base_commission_rate: 12.5,
    min_premium: 1800.0,
    flow_key: 'rc_professional_v1',
    pricing_strategy: 'rc_wix_planos_v1',
    policy_prefix: 'DL-RC-ENG',
    is_active: true,
    is_quoteable: true,
    is_contractable: true,
    is_payable: true,
    validity_days: 365,
    sale_recognition: 'on_payment',
    renewal_enabled: true,
    requires_underwriting: true,
    required_documents: [
      'Comprovante CREA/CAU Ativo',
      'Cópia da ART/RRT do Projeto ou Obra',
      'Memorial Desritivo ou Escopo da Prestação de Serviço',
    ],
  },
  {
    name: 'RC Profissional — Contadores & Auditores',
    code: 'RC-CONT-001',
    category: 'Responsabilidade Civil',
    product_type: 'insurance',
    insurer_name: 'Akad Seguros',
    insurer_cnpj: '14.862.008/0001-23',
    description: 'Proteção para escritórios de contabilidade contra autuações fiscais de clientes, erros em obrigações acessórias, apuração de impostos e folhas de pagamento.',
    public_title: 'Seguro RC Contabilidade e Perícia',
    target_audience: 'Contadores, peritos contábeis e empresas de serviços contábeis',
    base_commission_rate: 12.5,
    min_premium: 1100.0,
    flow_key: 'rc_professional_v1',
    pricing_strategy: 'rc_wix_planos_v1',
    policy_prefix: 'DL-RC-CON',
    is_active: true,
    is_quoteable: true,
    is_contractable: true,
    is_payable: true,
    validity_days: 365,
    sale_recognition: 'on_payment',
    renewal_enabled: true,
    requires_underwriting: false,
    required_documents: [
      'Registro no CRC Ativo',
      'Documento de Identidade com CPF',
    ],
  },
  {
    name: 'Seguro Saúde PME & Empresarial',
    code: 'SAUDE-CORP-001',
    category: 'Saúde Suplementar',
    product_type: 'insurance',
    insurer_name: 'Bradesco Saúde / SulAmérica / Amil',
    insurer_cnpj: '92.693.118/0001-60',
    description: 'Solução completa de assistência médica corporativa com ampla rede credenciada de hospitais, laboratórios e atendimento nacional.',
    public_title: 'Plano de Saúde Corporativo PME',
    target_audience: 'Empresas de todos os portes a partir de 2 vidas (sócios e colaboradores)',
    base_commission_rate: 100.0,
    min_premium: 450.0,
    flow_key: 'manual_v1',
    pricing_strategy: 'manual_v1',
    policy_prefix: 'DL-SAU',
    is_active: true,
    is_quoteable: true,
    is_contractable: false,
    is_payable: false,
    validity_days: 365,
    sale_recognition: 'on_payment',
    renewal_enabled: true,
    requires_underwriting: true,
    required_documents: [
      'Cartão CNPJ Atualizado',
      'Contrato Social e Alterações',
      'Relação de Beneficiários e Dependentes',
    ],
  },
];

async function main() {
  console.log('🌱 Semeando produtos RC e ofertas comerciais no banco de dados...');
  for (const item of rcProducts) {
    const [prod] = await sql`
      INSERT INTO products (
        name, code, category, product_type, insurer_name, insurer_cnpj, description,
        public_title, target_audience, base_commission_rate, min_premium, flow_key,
        pricing_strategy, policy_prefix, is_active, is_quoteable, is_contractable,
        is_payable, validity_days, sale_recognition, renewal_enabled, requires_underwriting,
        required_documents
      ) VALUES (
        ${item.name}, ${item.code}, ${item.category}, ${item.product_type}, ${item.insurer_name},
        ${item.insurer_cnpj}, ${item.description}, ${item.public_title}, ${item.target_audience},
        ${item.base_commission_rate}, ${item.min_premium}, ${item.flow_key}, ${item.pricing_strategy},
        ${item.policy_prefix}, ${item.is_active}, ${item.is_quoteable}, ${item.is_contractable},
        ${item.is_payable}, ${item.validity_days}, ${item.sale_recognition}, ${item.renewal_enabled},
        ${item.requires_underwriting}, ${JSON.stringify(item.required_documents)}::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        insurer_name = EXCLUDED.insurer_name,
        description = EXCLUDED.description,
        base_commission_rate = EXCLUDED.base_commission_rate,
        min_premium = EXCLUDED.min_premium,
        is_active = true,
        is_quoteable = true,
        required_documents = EXCLUDED.required_documents
      RETURNING id, name, code
    `;

    console.log(`✅ Produto gravado: [${prod.code}] ${prod.name}`);

    // Habilita para todos os parceiros ativos
    await sql`
      INSERT INTO partner_product_availability (partner_id, product_id, is_active)
      SELECT pa.id, ${prod.id}, true
      FROM partners pa
      WHERE pa.status = 'active'
      ON CONFLICT (partner_id, product_id) DO UPDATE SET is_active = true
    `;
  }

  console.log('🎉 Todos os produtos RC foram cadastrados e vinculados aos parceiros ativos com sucesso!');
}

main()
  .catch((err) => {
    console.error('❌ Erro ao semear produtos RC:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
