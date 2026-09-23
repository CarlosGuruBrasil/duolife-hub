'use client';

/**
 * Fachada retrocompatível para o motor dinâmico multi-ramo de cotações (DynamicCotacaoForm).
 * 
 * Mantém 100% de retrocompatibilidade com todas as páginas e componentes existentes
 * (/portal/cotacoes/nova, /admin/cotacoes/nova, /contratar/[token], DescontoDrawer, etc.).
 */

import DynamicCotacaoForm, {
  type Plano,
  type DynamicCotacaoFormProps,
} from './DynamicCotacaoForm';
import type { RamoConfig } from '@/lib/product-schemas';

export type { Plano };

export interface CotacaoFormRCProps {
  adminSelectedPartnerId?: string;
  publicToken?: string;
  productId?: string;
  initialCotacaoId?: string;
  initialCpf?: string;
  initialRenovacao?: boolean;
  ramoConfigOverride?: RamoConfig;
  initialDiscountPercent?: number;
}

export default function CotacaoFormRC({
  adminSelectedPartnerId,
  publicToken,
  productId,
  initialCotacaoId,
  initialCpf,
  initialRenovacao,
  ramoConfigOverride,
  initialDiscountPercent,
}: CotacaoFormRCProps) {
  return (
    <DynamicCotacaoForm
      adminSelectedPartnerId={adminSelectedPartnerId}
      publicToken={publicToken}
      productId={productId || 'prod-rc-001'}
      initialCotacaoId={initialCotacaoId}
      initialCpf={initialCpf}
      initialRenovacao={initialRenovacao}
      ramoConfigOverride={ramoConfigOverride}
      initialDiscountPercent={initialDiscountPercent}
    />
  );
}
