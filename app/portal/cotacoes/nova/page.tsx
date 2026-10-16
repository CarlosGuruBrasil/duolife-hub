import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import CotacaoFormRC from '@/components/portal/CotacaoFormRC';
import GerarLinkClienteButton from '@/components/portal/GerarLinkClienteButton';
import { verifyPartnerAuth, isDevUser, isPlatformAdmin } from '@/lib/auth';
import { sql } from '@/lib/pg';
import { getRamoConfig } from '@/lib/product-schemas';

type Product = {
  id: string;
  name: string;
  description: string | null;
  product_type: 'insurance' | 'service';
  flow_key: string;
  code?: string;
  is_quoteable: boolean;
};

export default async function NovaCotacaoPage({
  searchParams,
}: {
  searchParams: Promise<{
    product?: string;
    cotacaoId?: string;
    cpf?: string;
    clientCpfCnpj?: string;
    renovacao?: string;
    origemSaleId?: string;
  }>;
}) {
  const user = await verifyPartnerAuth();
  if (!user) redirect('/login');

  const isDev = isDevUser(user) || isPlatformAdmin(user);

  let effectivePartnerId = user.partnerId;
  if (!effectivePartnerId && user.corretoraId) {
    const [p] = await sql`
      SELECT id FROM partners
      WHERE corretora_id = ${user.corretoraId} AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    effectivePartnerId = p?.id || null;
  }

  // Fallback de desenvolvedor/administrador para testes no portal
  if (!effectivePartnerId && isDev) {
    const [p] = await sql`
      SELECT id FROM partners
      WHERE status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    effectivePartnerId = p?.id || null;
  }

  if (!effectivePartnerId) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center max-w-xl mx-auto my-12 shadow-sm">
        <ClipboardList className="mx-auto mb-3 text-primary" size={36} />
        <h2 className="text-lg font-bold text-gray-900">Cadastre seu primeiro vendedor</h2>
        <p className="mt-2 text-sm text-gray-600">
          Como administrador da corretora, você precisa ter pelo menos um corretor ou vendedor credenciado na sua equipe para emitir cotações e propostas.
        </p>
        <div className="mt-6">
          <Link
            href="/portal/equipe"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#00d4e0] text-[#072a33] font-bold rounded-xl text-xs uppercase tracking-wider shadow-xs hover:bg-[#00b8c4] transition-all"
          >
            Cadastrar Vendedor em Minha Equipe
          </Link>
        </div>
      </div>
    );
  }
  const { product: paramProductId, cotacaoId, cpf, clientCpfCnpj, renovacao } = await searchParams;

  const targetCpf = cpf || clientCpfCnpj;
  const isRenovacaoReq = renovacao === 'true' || renovacao === 'Sim' || Boolean(targetCpf);

  let productId = paramProductId;
  if (cotacaoId && !productId) {
    const userCorretoraId = user.corretoraId || null;
    const [c] = await sql`
      SELECT product_id FROM cotacoes
      WHERE id = ${cotacaoId} AND (partner_id = ${effectivePartnerId} OR (corretora_id IS NOT NULL AND corretora_id = ${userCorretoraId}))
      LIMIT 1
    `;
    if (c?.product_id) {
      productId = c.product_id;
    }
  }

  // Se veio por link de renovação e não especificou produto, adota o RC padrão
  if (!productId && targetCpf) {
    productId = 'prod-rc-001';
  }

  // Bloqueio de acesso direto por parceiros a produtos em desenvolvimento
  const isMedParam = productId === 'prod-rc-med-001' || productId === 'RC-MED-001';
  if (isMedParam && !isDev) {
    redirect('/portal/cotacoes/nova');
  }

  // Apenas produtos ativos para o parceiro aparecem para contratação
  let products: Product[] = Array.from(await sql<Product[]>`
    SELECT p.id, p.name, p.description, p.product_type, p.flow_key, p.code, p.is_quoteable
    FROM products p JOIN partner_product_availability ppa ON ppa.product_id = p.id
    WHERE ppa.partner_id = ${effectivePartnerId} AND ppa.is_active = true AND p.is_active = true
    ORDER BY p.name
  `);

  // Se o usuário for desenvolvedor, inclui o RC Médico para testes
  if (isDev) {
    const hasMed = products.some((p) => p.id === 'prod-rc-med-001' || p.code === 'RC-MED-001');
    if (!hasMed) {
      const [medProd] = await sql<Product[]>`
        SELECT id, name, description, product_type, flow_key, code, is_quoteable
        FROM products
        WHERE (id = 'prod-rc-med-001' OR code = 'RC-MED-001') AND is_active = true
        LIMIT 1
      `;
      if (medProd) {
        products = [...products, medProd];
      }
    }
  } else {
    // Parceiros comuns NÃO visualizam produtos em desenvolvimento
    products = products.filter(
      (p) => p.id !== 'prod-rc-med-001' && p.code !== 'RC-MED-001' && p.flow_key !== 'rc-medicos' && p.flow_key !== 'rc_medicos_v1'
    );
  }

  if (!productId) {
    return (
      <div>
        <div className="mb-8">
          <Link href="/portal/cotacoes" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
            ← Voltar para operações
          </Link>
          <h1 className="page-title mt-3">Nova operação</h1>
          <p className="muted mt-1 text-sm">Escolha o produto ou serviço que deseja iniciar.</p>
        </div>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <ClipboardList className="mx-auto mb-3 text-gray-400" size={28} />
            <h2 className="font-semibold text-gray-900">Nenhuma oferta disponível</h2>
            <p className="mt-1 text-sm text-gray-500">Fale com a DuoLife para habilitar produtos para sua operação.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {products.map((product) => {
              const ready = product.is_quoteable && Boolean(getRamoConfig({ flowKey: product.flow_key, code: product.code }));
              const isEmDev =
                product.id === 'prod-rc-med-001' ||
                product.code === 'RC-MED-001' ||
                product.flow_key === 'rc-medicos' ||
                product.flow_key === 'rc_medicos_v1';

              return (
                <div key={product.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <ShieldCheck size={22} style={{ color: 'var(--primary)' }} />
                    <div className="flex items-center gap-2">
                      {isEmDev && (
                        <span className="rounded-full bg-amber-50 border border-amber-300 text-amber-800 font-bold px-2.5 py-0.5 text-xs">
                          Em Desenvolvimento
                        </span>
                      )}
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        {product.product_type === 'insurance' ? 'Seguro' : 'Serviço'}
                      </span>
                    </div>
                  </div>
                  <h2 className="font-semibold text-gray-900">{product.name}</h2>
                  <p className="mt-2 min-h-10 text-sm text-gray-500">
                    {product.description || 'Oferta disponível para sua operação.'}
                  </p>
                  {ready ? (
                    <Link
                      href={`/portal/cotacoes/nova?product=${encodeURIComponent(product.id)}`}
                      className="mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white"
                      style={{ background: 'var(--primary)' }}
                    >
                      Continuar
                    </Link>
                  ) : (
                    <span className="mt-5 inline-flex rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500">
                      Em breve
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const product = products.find((item) => item.id === productId);
  if (!product) redirect('/portal/cotacoes/nova');

  const isEmDev =
    product.id === 'prod-rc-med-001' ||
    product.code === 'RC-MED-001' ||
    product.flow_key === 'rc-medicos' ||
    product.flow_key === 'rc_medicos_v1';

  const ramoConfig = getRamoConfig({ flowKey: product.flow_key, code: product.code });
  if (!product.is_quoteable || !ramoConfig) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="font-semibold text-amber-900">Este fluxo ainda não está disponível</h1>
        <p className="mt-1 text-sm text-amber-800">A oferta foi habilitada, mas a jornada digital ainda está em preparação.</p>
        <Link href="/portal/cotacoes/nova" className="mt-4 inline-block text-sm font-semibold text-amber-900 underline">
          Voltar ao catálogo
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/portal/cotacoes/nova" className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
          ← Trocar produto
        </Link>
        <div className="flex items-center gap-3 mt-3">
          <h1 className="page-title">
            {cotacaoId ? `Continuar Cotação — ${product.name}` : product.name}
          </h1>
          {isEmDev && (
            <span className="rounded-full bg-amber-50 border border-amber-300 text-amber-800 font-bold px-2.5 py-0.5 text-xs">
              Em Desenvolvimento
            </span>
          )}
        </div>
        <p className="muted mt-1 text-sm">
          {cotacaoId ? 'Revise os dados e avance para finalizar sua proposta.' : 'Preencha as etapas para iniciar sua proposta.'}
        </p>
      </div>

      {!cotacaoId && (
        <div className="mb-6">
          <GerarLinkClienteButton
            products={products.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
            defaultProductId={product.id}
            variant="banner"
          />
        </div>
      )}

      <CotacaoFormRC
        productId={product.id}
        initialCotacaoId={cotacaoId}
        initialCpf={targetCpf}
        initialRenovacao={isRenovacaoReq}
        ramoConfigOverride={ramoConfig}
      />
    </div>
  );
}
