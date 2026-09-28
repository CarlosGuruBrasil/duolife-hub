import { redirect } from 'next/navigation';
import ContractPageClient from './_client';
import { resolveContratoSignUrl } from '@/lib/contrato-link-resolver';

export default async function ContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Se o link corresponder a uma cotação/contrato com link de assinatura ZapSign ativo,
  // redireciona diretamente o navegador do cliente para a página de assinatura.
  const signUrl = await resolveContratoSignUrl(token);
  if (signUrl) {
    redirect(signUrl);
  }

  return <ContractPageClient token={token} />;
}
