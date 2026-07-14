import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { MessageCircle } from 'lucide-react';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const BASE_URL = 'https://duolife.com.br';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'DuoLife Hub de Negócios | Assessoria para Corretores em SC',
    template: '%s | DuoLife Hub de Negócios',
  },
  description:
    'Assessoria completa para corretores e consultores de saúde, seguros e benefícios em Santa Catarina. Suporte comercial, técnico, operacional e pós-venda. Joinville e Florianópolis.',
  keywords: [
    'assessoria corretores seguros',
    'hub de negócios benefícios',
    'corretora de seguros SC',
    'seguro saúde Joinville',
    'seguro saúde Florianópolis',
    'benefícios corporativos Santa Catarina',
    'parceiro DuoLife',
    'seguro responsabilidade civil',
    'RC profissional',
    'assessoria seguros',
  ],
  authors: [{ name: 'DuoLife Hub de Negócios', url: BASE_URL }],
  creator: 'DuoLife Hub de Negócios',
  publisher: 'DuoLife Hub de Negócios',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: BASE_URL,
    siteName: 'DuoLife Hub de Negócios',
    title: 'DuoLife Hub de Negócios | Assessoria para Corretores em SC',
    description:
      'Assessoria completa para corretores e consultores. Suporte comercial, técnico, operacional e pós-venda. Joinville e Florianópolis.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'DuoLife Hub de Negócios — Assessoria para Corretores',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DuoLife Hub de Negócios | Assessoria para Corretores em SC',
    description:
      'Assessoria completa para corretores e consultores de saúde, seguros e benefícios em SC.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/favicon.png',
    shortcut: '/favicon.png',
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col" style={{ fontFamily: 'var(--font-jakarta), Inter, system-ui, sans-serif' }}>
        {children}
        <a
          href="https://wa.me/5547996486081?text=Olá! Gostaria de falar com o time comercial da DuoLife."
          target="_blank"
          rel="noopener"
          aria-label="Falar no WhatsApp"
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:scale-110 md:bottom-6 md:right-6 md:h-14 md:w-14"
        >
          <MessageCircle className="h-6 w-6 md:h-7 md:w-7" strokeWidth={2} />
        </a>
      </body>
    </html>
  );
}
