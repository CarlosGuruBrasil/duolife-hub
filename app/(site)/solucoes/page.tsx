import type { Metadata } from 'next';
import SolucoesClient from './_client';

export const metadata: Metadata = {
  title: 'Soluções',
  description: 'Conheça nossas frentes de apoio comercial, técnico, operacional e pós-venda para corretores e consultores de seguros e benefícios corporativos.',
  alternates: { canonical: 'https://duolife.com.br/solucoes' },
  openGraph: {
    title: 'Soluções | DuoLife Hub de Negócios',
    description: 'Assessoria técnico-comercial em benefícios e produtos securitários.',
    url: 'https://duolife.com.br/solucoes',
  },
};

export default function Solucoes() {
  return <SolucoesClient />;
}
