import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolvePartnerOrLink } from '@/lib/referral';
import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';

interface ContratarPageProps {
  searchParams: Promise<{ ref?: string }>;
}

export default async function ContratarIndexPage({ searchParams }: ContratarPageProps) {
  const { ref } = await searchParams;

  // 1. Tenta resolver via parâmetro ?ref=...
  if (ref) {
    const resolved = await resolvePartnerOrLink(ref);
    if (resolved) {
      redirect(`/contratar/${resolved.token}`);
    }
  }

  // 2. Se não veio parâmetro, tenta recuperar do cookie de indicação 'duolife_ref'
  const cookieStore = await cookies();
  const cookieRef = cookieStore.get('duolife_ref')?.value;

  if (cookieRef) {
    const resolvedFromCookie = await resolvePartnerOrLink(cookieRef);
    if (resolvedFromCookie) {
      redirect(`/contratar/${resolvedFromCookie.token}`);
    }
  }

  // 3. Fallback: Se não há indicação válida informada
  return (
    <div className="min-h-screen bg-[#f7faf9] flex items-center justify-center p-4 font-sans">
      <div className="card max-w-md w-full text-center space-y-6 p-8 bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
          <AlertCircle size={28} />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-gray-900">Código de Contratação Necessário</h1>
          <p className="text-sm text-gray-600">
            Para iniciar sua proposta digital, por favor utilize o link exclusivo fornecido pelo seu corretor parceiro DuoLife ou informe seu código de indicação.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <Link
            href="/"
            className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <ArrowLeft size={16} />
            <span>Voltar para a Página Inicial</span>
          </Link>
          <a
            href="https://wa.me/5547996486081?text=Olá!%20Gostaria%20de%20solicitar%20um%20link%20de%20contratação%20de%20seguro."
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary w-full text-sm"
          >
            Falar com a Equipe DuoLife
          </a>
        </div>
      </div>
    </div>
  );
}
