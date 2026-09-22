import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import ReferralTracker from '@/components/public/ReferralTracker';
import { ToastContainer } from '@/components/ui/toast';
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
        <Suspense fallback={null}>
          <ReferralTracker />
        </Suspense>
        <ToastContainer />
        {children}
      </body>
    </html>
  );
}
