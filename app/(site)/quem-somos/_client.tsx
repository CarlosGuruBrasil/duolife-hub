'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Eye, Handshake, Lightbulb, Scale, Star, Target, Users, Check } from 'lucide-react';
import InternalPageHero from '@/components/site/InternalPageHero';

const team = [
  { 
    name: 'Ricardo Abramo Padua Mello', 
    role: 'CEO e Sócio-Fundador', 
    since: 'Desde 1995', 
    image: '/team/ricardo-abramo-padua-mello.png',
    bio: 'Lidera a DuoLife desde a sua fundação em 1995, consolidando a marca como referência de qualidade e ética na distribuição de benefícios corporativos e estruturação técnica.'
  },
  { 
    name: 'Sandro Savio Petrucci Machado', 
    role: 'Sócio-Gerente', 
    since: 'Desde 2019', 
    image: '/team/sandro-savio-petrucci-machado.png',
    bio: 'Com vasta experiência operacional e de mercado, integra a sociedade desde 2019 estruturando e liderando toda a operação do back-office e suporte técnico aos parceiros.'
  },
  { 
    name: 'Pedro Henrique Tavares Padua Mello', 
    role: 'Gerente Comercial e Pós-Vendas', 
    since: 'Desde 2026', 
    image: '/team/pedro-henrique-tavares-padua-mello.png',
    bio: 'Assume a gestão em 2026 com foco na expansão de carteiras, aproximação comercial com consultores do Sul e suporte direto de pós-vendas no dia a dia.'
  },
];

const values = [
  { icon: Scale, title: 'Ética', desc: 'Transparência e integridade em cada relação estabelecida no mercado.' },
  { icon: Handshake, title: 'Respeito', desc: 'Acolhimento real e duradouro para parceiros, seguradoras e clientes.' },
  { icon: Star, title: 'Qualidade', desc: 'Excelência técnica e operacional como padrão inabalável de entrega.' },
  { icon: Lightbulb, title: 'Inovação', desc: 'Tecnologia moderna e melhoria contínua a serviço de resultados práticos.' },
];

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
  style?: any;
}

function Card3D({ children, className = '', style = {} }: Card3DProps) {
  return (
    <div
      style={style}
      className={className}
    >
      <div className="w-full h-full flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
}

export default function QuemSomosClient() {
  return (
    <div className="bg-white text-primary-dark">

      {/* Hero Section (mesmo idioma visual da home) */}
      <InternalPageHero
        badge="Nossa História"
        imageSrc="/duolife-broker-woman.jpg"
        imageClassName="object-cover object-[50%_18%]"
        title={
          <>
            O elo entre <span className="text-gradient-shimmer font-black">corretores</span>, clientes e seguradoras.
          </>
        }
        description="A DuoLife é uma assessoria de negócios especializada no acolhimento e retaguarda técnico-operacional de corretores e consultores de seguros de saúde suplementar e benefícios corporativos."
      />

      {/* Seção Quem Somos (Split com foto real) */}
      <section className="py-20 md:py-28 px-6 bg-white border-b border-border">
        <div className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 items-center">

          <div className="lg:col-span-7 text-left">
            <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Nossa Essência</span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-primary uppercase mb-6">
              Suporte completo para quem está na linha de frente das vendas.
            </h2>
            <p className="text-[#4d686f] font-light leading-relaxed text-lg mb-6">
              Nossa atuação remove toda a barreira técnica e a burocracia diária que drenam a produtividade dos corretores de seguros. Focamos incondicionalmente em dar velocidade para suas operações comerciais de saúde suplementar, benefícios corporativos e produtos securitários.
            </p>
            
            <ul className="space-y-4 mt-8">
              {[
                { text: '+180 corretores e consultores parceiros ativos' },
                { text: 'Atuação comercial nacional com foco especial na Região Sul' },
                { text: 'Relacionamento preferencial com as maiores seguradoras do mercado' }
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-3 text-sm text-primary font-bold">
                  <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 relative h-[450px] rounded-[36px] overflow-hidden border border-border shadow-2xl">
            <Image
              src="/duolife-team-meeting.jpg"
              alt="Reunião estratégica de negócios DuoLife"
              fill
              sizes="(max-width: 980px) 100vw, 40vw"
              className="object-cover"
            />
          </div>

        </div>
      </section>

      {/* Diretrizes Culturais (Fundo Off-white) */}
      <section className="py-20 md:py-28 px-6 bg-surface border-b border-border">
        <div className="w-[min(92%,1800px)] mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Princípios</span>
            <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase">
              Missão, visão e valores.
            </h2>
          </div>

          {/* Missão e Visão */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <Card3D className="bg-white border border-border rounded-3xl p-8 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-12 h-12 rounded-xl bg-accent/10 text-primary flex items-center justify-center mb-6">
                  <Target size={22} />
                </div>
                <h3 className="text-xl font-black text-primary uppercase tracking-tight">Missão</h3>
                <p className="text-sm text-[#4d686f] mt-4 font-light leading-relaxed">
                  Impulsionar corretores e consultores com uma assessoria estratégica, tecnológica e acolhedora, promovendo resultados práticos e excelência contínua na jornada de vendas de seguros e benefícios.
                </p>
              </div>
            </Card3D>

            <Card3D className="bg-white border border-border rounded-3xl p-8 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-12 h-12 rounded-xl bg-secondary/10 text-primary flex items-center justify-center mb-6">
                  <Eye size={22} />
                </div>
                <h3 className="text-xl font-black text-primary uppercase tracking-tight">Visão</h3>
                <p className="text-sm text-[#4d686f] mt-4 font-light leading-relaxed">
                  Ser a principal referência nacional em assessoria técnico-comercial B2B, unindo inovação, processos digitais e acolhimento humano para prover a melhor assistência no setor de proteção.
                </p>
              </div>
            </Card3D>
          </div>

          {/* Valores */}
          <div className="grid md:grid-cols-4 gap-6">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="bg-white border border-border rounded-2xl p-6 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center mb-4">
                    <Icon size={16} />
                  </div>
                  <h4 className="text-base font-black text-primary uppercase tracking-tight">{v.title}</h4>
                  <p className="text-xs text-[#4d686f] mt-2 font-light leading-relaxed">{v.desc}</p>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* A Liderança (Fundo Branco) */}
      <section className="pt-32 pb-20 md:pt-36 md:pb-28 px-6 bg-white scroll-mt-28">
        <div className="w-[min(92%,1800px)] mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Liderança</span>
            <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase">
              Sócios e Diretores
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {team.map((member) => (
              <Card3D 
                key={member.name} 
                className="group relative overflow-hidden rounded-[32px] border border-border bg-[linear-gradient(180deg,#ffffff_0%,#fbfefe_62%,#f5fbfb_100%)] p-8 md:p-10 shadow-[0_28px_80px_rgba(14,74,90,0.12)] hover:-translate-y-1 hover:shadow-[0_34px_90px_rgba(14,74,90,0.18)] transition-all text-center"
              >
                <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />
                <div className="relative flex h-full flex-col items-center">
                  <div className="rounded-full bg-gradient-to-br from-primary/12 via-white to-accent/18 p-1.5 shadow-[0_18px_34px_rgba(14,74,90,0.12)]">
                    <div className="relative h-36 w-36 overflow-hidden rounded-full border border-white/90 bg-white md:h-40 md:w-40">
                      <Image
                        src={member.image}
                        alt={member.name}
                        fill
                        sizes="(min-width: 768px) 10rem, 9rem"
                        className="object-cover object-center"
                      />
                    </div>
                  </div>
                  <div className="mt-7 flex justify-center">
                    <span className="inline-flex max-w-full items-center justify-center rounded-full border border-border bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-secondary leading-[1.2] shadow-[0_8px_24px_rgba(14,74,90,0.06)]">
                      {member.role}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[1.08rem] font-black uppercase leading-[1.08] tracking-tight text-primary md:text-[1.14rem]">{member.name}</h3>
                  <p className="mx-auto mt-4 max-w-[32ch] text-[0.98rem] font-normal leading-relaxed text-[#435a61]">{member.bio}</p>
                  <div className="mt-7 w-full border-t border-border pt-4 text-[10px] font-black uppercase tracking-[0.18em] text-secondary">
                    {member.since}
                  </div>
                </div>
              </Card3D>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-primary-dark text-white py-24 px-6 relative overflow-hidden text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle,_rgba(0,212,224,0.12)_0%,_transparent_60%)] pointer-events-none" />
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="text-accent text-xs font-black uppercase tracking-widest mb-4 block">Faça parte</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight uppercase mb-8">
            Construa sua próxima fase com apoio real.
          </h2>
          <p className="text-white/70 font-light text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Converse com nossa equipe e entenda como a DuoLife pode alavancar os fechamentos de seguros e benefícios corporativos da sua corretora.
          </p>
          <div className="flex justify-center">
            <Link 
              href="/seja-parceiro" 
              className="bg-accent hover:bg-[#00b2be] text-primary-dark px-10 py-5 rounded-full font-black text-sm transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-accent/10"
            >
              Fazer Cadastro de Parceiro
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
