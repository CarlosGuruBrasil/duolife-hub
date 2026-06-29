import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DuoLife Hub de Negócios | Parceira em Benefícios Corporativos',
  description: 'Parceira de Excelência em Benefícios Corporativos. Suporte Comercial, Técnico, Operacional e Pós-Venda para Corretores e Consultores há quase uma década.',
  keywords: 'hub negócios, seguros, benefícios corporativos, assessoria, corretores, Joinville, Santa Catarina',
  icons: {
    icon: '/logo-vertical.png',
    apple: '/logo-vertical.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col" style={{ fontFamily: 'var(--font-jakarta), Inter, system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
