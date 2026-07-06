import type { Metadata } from 'next';
import QuemSomosClient from './_client';

export const metadata: Metadata = {
  title: 'Quem Somos',
  description: 'Conheça a DuoLife Hub de Negócios, assessoria especializada no apoio a corretores e consultores de seguros e benefícios corporativos.',
  alternates: { canonical: 'https://duolife.com.br/quem-somos' },
  openGraph: {
    title: 'Quem Somos | DuoLife Hub de Negócios',
    description: 'Conheça a história, missão, visão, valores e equipe da DuoLife.',
    url: 'https://duolife.com.br/quem-somos',
  },
};

export default function QuemSomos() {
  return <QuemSomosClient />;
}
