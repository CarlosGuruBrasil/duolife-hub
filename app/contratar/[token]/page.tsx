import ContractPageClient from './_client';

export default async function ContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ContractPageClient token={token} />;
}
