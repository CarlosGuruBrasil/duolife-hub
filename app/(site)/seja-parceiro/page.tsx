import type { Metadata } from 'next';
import SejaParceiroClient from './_client';

export const metadata: Metadata = {
  title: 'Seja Parceiro',
  description: 'Cadastre-se como corretor parceiro DuoLife e tenha acesso a suporte comercial, técnico, operacional e pós-venda. Mais de 180 parceiros ativos em SC.',
  alternates: { canonical: 'https://duolifehub.com.br/seja-parceiro' },
  openGraph: {
    title: 'Seja Parceiro | DuoLife Hub de Negócios',
    description: 'Junte-se a mais de 180 corretores parceiros DuoLife. Mais vendas, menos burocracia. Cadastre-se agora.',
    url: 'https://duolifehub.com.br/seja-parceiro',
  },
};

export default function SejaParceiro() {
  return <SejaParceiroClient />;
}
