import type { Metadata } from 'next';
import ContatoClient from './_client';

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Entre em contato com a DuoLife Hub de Negócios. Atendimento comercial e operacional em Joinville e Florianópolis, SC. WhatsApp, e-mail e redes sociais.',
  alternates: { canonical: 'https://duolifehub.com.br/contato' },
  openGraph: {
    title: 'Contato | DuoLife Hub de Negócios',
    description: 'Fale com a equipe DuoLife. Atendimento de segunda a sexta, 8h às 18h. Resposta no WhatsApp em até 2 horas úteis.',
    url: 'https://duolifehub.com.br/contato',
  },
};

export default function Contato() {
  return <ContatoClient />;
}
