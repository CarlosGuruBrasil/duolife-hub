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
          href="https://wa.me/5547991533897?text=Olá! Gostaria de falar com o time comercial da DuoLife."
          target="_blank"
          rel="noopener"
          aria-label="Falar no WhatsApp"
          className="fixed bottom-6 right-6 z-[60] flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-transform duration-200 hover:scale-110"
        >
          <MessageCircle size={28} strokeWidth={2} />
        </a>
      </body>
    </html>
  );
}
