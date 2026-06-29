import Link from 'next/link';
import { BriefcaseBusiness, CheckCircle2, ClipboardList, Handshake, Headphones, Laptop, ShieldCheck, TriangleAlert, Zap } from 'lucide-react';

const pillars = [
  {
    icon: Handshake, title: 'Suporte Comercial',
    desc: 'Estratégias de venda, expansão de carteira e treinamento comercial.',
    items: [
      'Estratégias de abordagem e fechamento',
      'Expansão territorial e novos mercados',
      'Treinamento de equipes de vendas',
      'Suporte em negociações complexas',
      'Acompanhamento de metas e performance',
    ],
  },
  {
    icon: ClipboardList, title: 'Suporte Técnico',
    desc: 'Capacitação especializada e elaboração de propostas técnicas.',
    items: [
      'Capacitação técnica das equipes',
      'Confecção e revisão de propostas',
      'Análise de apólices e coberturas',
      'Atualização sobre regulamentações SUSEP',
      'Consultoria em produtos específicos',
    ],
  },
  {
    icon: Laptop, title: 'Suporte Operacional',
    desc: 'Back-office completo e terceirização de processos burocráticos.',
    items: [
      'Gestão de propostas e contratos',
      'Processos de emissão e endosso',
      'Back-office administrativo',
      'Controle de renovações',
      'Gestão documental',
    ],
  },
  {
    icon: Headphones, title: 'Pós-Venda',
    desc: 'Acompanhamento contínuo para garantir satisfação e retenção.',
    items: [
      'Intermediação com operadoras e seguradoras',
      'Acompanhamento de sinistros',
      'Suporte ao cliente pós-emissão',
      'Gestão de renovações',
      'Relacionamento com entidades de classe',
    ],
  },
];

const challenges = [
  'Capacitação técnica das equipes',
  'Processos burocráticos na confecção de propostas',
  'Suporte lento ou sem solução',
  'Falta de apoio operacional',
];

export default function Solucoes() {
  return (
    <div>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }} className="text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>O que oferecemos</p>
          <h1 className="text-4xl md:text-5xl font-black mb-6">Nossas Soluções</h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#d7e6e8' }}>
            Suporte completo para os negócios fluirem do começo ao fim. Somos especialistas em <strong className="text-white">Destravar Resultados.</strong>
          </p>
        </div>
      </section>

      {/* Desafios do mercado */}
      <section className="py-16 px-4" style={{ background: 'var(--accent-soft)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>O Problema</p>
            <h2 className="text-3xl font-black" style={{ color: 'var(--primary)' }}>Desafios do Mercado</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">
              Corretores e Consultores de Benefícios lidam com dificuldades que comprometem a Eficiência e o Crescimento Sustentável.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {challenges.map(c => (
              <div key={c} className="card flex items-start gap-3">
                <TriangleAlert size={19} style={{ color: 'var(--secondary)' }} />
                <p className="text-sm font-medium text-gray-700">{c}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <p className="text-lg font-bold" style={{ color: 'var(--primary)' }}>
              A DuoLife resolve tudo isso.
            </p>
          </div>
        </div>
      </section>

      {/* 4 Pilares detalhados */}
      <section className="section">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>A Solução</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--primary)' }}>Suporte em 4 Pilares</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {pillars.map(p => {
            const Icon = p.icon;
            return (
            <div key={p.title} className="card">
              <div className="flex items-center gap-4 mb-4">
                <div className="icon-box"><Icon size={22} /></div>
                <div>
                  <h3 className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{p.title}</h3>
                  <p className="text-sm text-gray-500">{p.desc}</p>
                </div>
              </div>
              <ul className="space-y-2">
                {p.items.map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle2 size={15} style={{ color: 'var(--secondary)' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
          })}
        </div>
      </section>

      {/* Seguro RC destaque */}
      <section className="py-16 px-4" style={{ background: 'var(--primary)' }}>
        <div className="max-w-4xl mx-auto text-center text-white">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Produto em Destaque</p>
          <h2 className="text-3xl font-black mb-4">Seguro de Responsabilidade Civil Profissional</h2>
          <p className="mb-8 max-w-2xl mx-auto" style={{ color: '#d7e6e8' }}>
            A DuoLife é distribuidora autorizada do Seguro RC. Corretores parceiros têm acesso ao portal de cotação e venda direto pela nossa plataforma.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              { icon: ShieldCheck, t: 'Proteção profissional', d: 'Cobre reclamações de terceiros por erros e omissões' },
              { icon: BriefcaseBusiness, t: 'Para todas as profissões', d: 'Advogados, médicos, engenheiros e mais' },
              { icon: Zap, t: 'Cotação rápida', d: 'Portal exclusivo para corretores parceiros' },
            ].map(c => {
              const Icon = c.icon;
              return (
              <div key={c.t} className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="mb-3 inline-flex"><Icon size={26} /></div>
                <h4 className="font-bold mb-2">{c.t}</h4>
                <p className="text-sm" style={{ color: '#d7e6e8' }}>{c.d}</p>
              </div>
            );
            })}
          </div>
          <Link href="/seja-parceiro" className="btn-accent">
            Acesse o Portal de Cotação
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center">
        <h2 className="text-3xl font-black mb-4" style={{ color: 'var(--primary)' }}>Pronto para destravar seus resultados?</h2>
        <p className="text-gray-500 mb-8">Mais foco nas Vendas, menos em Burocracia.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/seja-parceiro" className="btn-primary">Seja nosso parceiro</Link>
          <Link href="/contato" className="btn-outline">Falar com a equipe</Link>
        </div>
      </section>
    </div>
  );
}
