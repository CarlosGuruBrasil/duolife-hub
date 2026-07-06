import type { Metadata } from 'next';
import UnidadesClient from './_client';

export const metadata: Metadata = {
  title: 'Unidades',
  description: 'DuoLife Hub de Negócios em Joinville e Florianópolis. Unidades ACIJ, Corporate Park e CDTEC com atuação nacional.',
  alternates: { canonical: 'https://duolife.com.br/unidades' },
  openGraph: {
    title: 'Unidades | DuoLife Hub de Negócios',
    description: 'Conheça as unidades DuoLife em Joinville e Florianópolis, SC.',
    url: 'https://duolife.com.br/unidades',
  },
};

export default function Unidades() {
  return <UnidadesClient />;
}
