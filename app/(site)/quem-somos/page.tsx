import Link from 'next/link';
import { Eye, Handshake, Lightbulb, Scale, Star, Target } from 'lucide-react';

const team = [
  { name: 'Ricardo Abramo Padua Mello', role: 'CEO & Fundador', since: 'Desde 1995', initial: 'R' },
  { name: 'Sandro Savio Petrucci Machado', role: 'Sócio-Gerente', since: 'Desde 2019', initial: 'S' },
  { name: 'Pedro Henrique Tavares Padua Mello', role: 'Gerente Comercial e Pós-Vendas', since: 'Desde 2026', initial: 'P' },
];

const values = [
  { icon: Scale, title: 'Ética', desc: 'Transparência e integridade em todas as relações.' },
  { icon: Handshake, title: 'Respeito', desc: 'Valorizamos cada parceiro e cliente como único.' },
  { icon: Star, title: 'Qualidade', desc: 'Excelência como padrão, não como exceção.' },
  { icon: Lightbulb, title: 'Inovação', desc: 'Tecnologia e criatividade a serviço dos resultados.' },
];

export default function QuemSomos() {
  return (
    <div>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }} className="text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Nossa História</p>
          <h1 className="text-4xl md:text-5xl font-black mb-6">Quem Somos</h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#d7e6e8' }}>
            Uma Assessoria especializada no acolhimento e atendimento a Corretores e Consultores de Seguros e Benefícios.
          </p>
        </div>
      </section>

      {/* Sobre */}
      <section className="section">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Nossa Essência</p>
            <h2 className="text-3xl font-black mb-6" style={{ color: 'var(--primary)' }}>Quase uma década de excelência</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              A DuoLife nasceu com a missão de ser o <strong>ELO entre Corretores e Seguradoras</strong> — eliminando a burocracia e potencializando resultados. Focada em <strong>Vendas e Administração de Saúde Suplementar, Benefícios Corporativos e Produtos Securitários</strong>.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Há quase uma década oferecemos suporte completo — <strong>Comercial, Técnico, Operacional e de Pós-venda</strong> — para facilitar o dia a dia de quem está na linha de frente, negociando com Clientes, Operadoras e Seguradoras.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Com mais de <strong>+180 corretores parceiros</strong> em todo o Brasil e presença especial na Região Sul, somos referência em assessoria técnico-comercial no setor.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { n: '+180', l: 'Parceiros ativos' },
              { n: '~10', l: 'Anos de mercado' },
              { n: '3', l: 'Unidades em SC' },
              { n: 'Sul', l: 'Foco regional' },
            ].map(({ n, l }) => (
              <div key={l} className="card text-center">
                <div className="text-3xl font-black mb-1" style={{ color: 'var(--primary)' }}>{n}</div>
                <div className="text-sm" style={{ color: 'var(--text-light)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Missão, Visão, Valores */}
      <section className="py-16 px-4" style={{ background: 'var(--accent-soft)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Nossos Princípios</p>
            <h2 className="text-3xl font-black" style={{ color: 'var(--primary)' }}>Missão, Visão e Valores</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="card border-l-4" style={{ borderColor: 'var(--primary)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="icon-box"><Target size={20} /></div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--primary)' }}>Missão</h3>
              </div>
              <p className="text-gray-600 leading-relaxed">
                Impulsionar Corretores e Consultores com uma assessoria estratégica, tecnológica e acolhedora, impulsionando resultados e excelência na jornada de vendas.
              </p>
            </div>
            <div className="card border-l-4" style={{ borderColor: 'var(--secondary)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="icon-box"><Eye size={20} /></div>
                <h3 className="text-xl font-bold" style={{ color: 'var(--primary)' }}>Visão</h3>
              </div>
              <p className="text-gray-600 leading-relaxed">
                Ser referência nacional em Assessoria Técnico-Comercial, unindo inovação, tecnologia e acolhimento para oferecer a melhor assistência no setor de proteção.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {values.map(v => {
              const Icon = v.icon;
              return (
              <div key={v.title} className="card text-center">
                <div className="icon-box mx-auto mb-3"><Icon size={21} /></div>
                <h4 className="font-bold text-lg mb-2" style={{ color: 'var(--primary)' }}>{v.title}</h4>
                <p className="text-sm text-gray-500">{v.desc}</p>
              </div>
            );
            })}
          </div>
        </div>
      </section>

      {/* Equipe */}
      <section className="section">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Nossa Equipe</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--primary)' }}>As pessoas por trás da DuoLife</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {team.map(m => (
            <div key={m.name} className="card text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black mx-auto mb-4"
                style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-light))' }}>
                {m.initial}
              </div>
              <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--primary)' }}>{m.name}</h3>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--secondary)' }}>{m.role}</p>
              <p className="text-xs" style={{ color: 'var(--text-light)' }}>{m.since}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center" style={{ background: 'var(--primary)' }}>
        <h2 className="text-3xl font-black text-white mb-4">Faça parte da nossa história</h2>
        <p className="mb-8" style={{ color: '#d7e6e8' }}>Junte-se aos +180 corretores que já confiam na DuoLife.</p>
        <Link href="/seja-parceiro" className="btn-accent">Quero ser parceiro</Link>
      </section>
    </div>
  );
}
