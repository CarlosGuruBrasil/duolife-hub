'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, Handshake, Lightbulb, Scale, Star, Target, Users, Sparkles, Check } from 'lucide-react';

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

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
  }
};

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
    <div className="bg-[#ffffff] text-[#072a33]">

      {/* Hero Section (mesmo idioma visual da home) */}
      <section className="relative isolate overflow-hidden bg-[#072a33] text-[#ffffff] min-h-screen flex items-start">
        <Image src="/duolife-broker-woman.jpg" alt="" fill className="object-cover object-[50%_18%]" priority />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(0,212,224,0.18)_0%,transparent_36%),linear-gradient(180deg,rgba(7,42,51,0.72)_0%,rgba(7,42,51,0.8)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#072a33] to-transparent" />

        <div className="relative z-10 w-[min(92%,1800px)] mx-auto px-6 pt-20 pb-20 lg:pt-28 lg:pb-24">
          <div className="max-w-[760px] text-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-[#00d4e0] px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-8 border border-white/5"
            >
              <Sparkles size={13} />
              Nossa História
            </motion.div>
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="hero-title-wrap text-4xl md:text-6xl lg:text-[76px] xl:text-[84px] font-black tracking-[-0.03em] leading-[1.02] uppercase mb-6 text-gradient-shimmer drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
            >
              O elo entre corretores, clientes e seguradoras.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="text-base md:text-lg text-white/84 leading-relaxed font-light mb-10 max-w-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)]"
            >
              A DuoLife é uma assessoria de negócios especializada no acolhimento e retaguarda técnico-operacional de corretores e consultores de seguros de saúde suplementar e benefícios corporativos.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Seção Quem Somos (Split com foto real) */}
      <section className="py-28 px-6 bg-[#ffffff] border-b border-[#e0eceb]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 items-center"
        >

          <div className="lg:col-span-7 text-left">
            <span className="text-xs font-black tracking-widest text-[#0e4a5a] uppercase mb-6 block">Nossa Essência</span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight text-[#0e4a5a] uppercase mb-6">
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
                <li key={idx} className="flex items-center gap-3 text-sm text-[#0e4a5a] font-bold">
                  <div className="w-5 h-5 rounded-full bg-[#00d4e0]/10 flex items-center justify-center text-[#00d4e0]">
                    <Check size={12} strokeWidth={3} />
                  </div>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 relative h-[450px] rounded-[36px] overflow-hidden border border-[#e0eceb] shadow-2xl">
            <Image
              src="/duolife-team-meeting.jpg"
              alt="Reunião estratégica de negócios DuoLife"
              fill
              sizes="(max-width: 980px) 100vw, 40vw"
              className="object-cover"
            />
          </div>

        </motion.div>
      </section>

      {/* Diretrizes Culturais (Fundo Off-white) */}
      <section className="py-28 px-6 bg-[#f7faf9] border-b border-[#e0eceb]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto"
        >
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-[#0e4a5a] uppercase mb-6 block">Princípios</span>
            <h2 className="text-4xl md:text-5.5xl font-black tracking-tight text-[#0e4a5a] uppercase">
              Missão, visão e valores.
            </h2>
          </div>

          {/* Missão e Visão */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <Card3D className="bg-white border border-[#e0eceb] rounded-3xl p-8 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-12 h-12 rounded-xl bg-[#00d4e0]/10 text-[#0e4a5a] flex items-center justify-center mb-6">
                  <Target size={22} />
                </div>
                <h3 className="text-xl font-black text-[#0e4a5a] uppercase tracking-tight">Missão</h3>
                <p className="text-sm text-[#4d686f] mt-4 font-light leading-relaxed">
                  Impulsionar corretores e consultores com uma assessoria estratégica, tecnológica e acolhedora, promovendo resultados práticos e excelência contínua na jornada de vendas de seguros e benefícios.
                </p>
              </div>
            </Card3D>

            <Card3D className="bg-white border border-[#e0eceb] rounded-3xl p-8 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="w-12 h-12 rounded-xl bg-[#7fa8b2]/10 text-[#0e4a5a] flex items-center justify-center mb-6">
                  <Eye size={22} />
                </div>
                <h3 className="text-xl font-black text-[#0e4a5a] uppercase tracking-tight">Visão</h3>
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
                <div key={v.title} className="bg-white border border-[#e0eceb] rounded-2xl p-6 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-[#0e4a5a]/5 text-[#0e4a5a] flex items-center justify-center mb-4">
                    <Icon size={16} />
                  </div>
                  <h4 className="text-base font-black text-[#0e4a5a] uppercase tracking-tight">{v.title}</h4>
                  <p className="text-xs text-[#4d686f] mt-2 font-light leading-relaxed">{v.desc}</p>
                </div>
              );
            })}
          </div>

        </motion.div>
      </section>

      {/* A Liderança (Fundo Branco) */}
      <section className="py-28 px-6 bg-[#ffffff]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto"
        >
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-[#0e4a5a] uppercase mb-6 block">Liderança</span>
            <h2 className="text-4xl md:text-5.5xl font-black tracking-tight text-[#0e4a5a] uppercase">
              Sócios e Diretores
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {team.map((member) => (
              <Card3D 
                key={member.name} 
                className="group relative overflow-hidden rounded-[32px] border border-[#d8e7e5] bg-[linear-gradient(180deg,#ffffff_0%,#fbfefe_62%,#f5fbfb_100%)] p-8 md:p-10 shadow-[0_24px_70px_rgba(14,74,90,0.08)] hover:-translate-y-1 hover:shadow-[0_30px_80px_rgba(14,74,90,0.14)] transition-all cursor-grab active:cursor-grabbing text-left"
              >
                <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-[#00d4e0]/5 to-transparent pointer-events-none" />
                <div className="grid gap-7 md:grid-cols-[176px_1fr] md:items-center">
                  <div className="flex justify-start">
                    <div className="rounded-full bg-gradient-to-br from-[#0e4a5a]/12 via-white to-[#00d4e0]/18 p-1.5 shadow-[0_18px_34px_rgba(14,74,90,0.12)]">
                      <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden border border-white/90 bg-white">
                        <Image
                          src={member.image}
                          alt={member.name}
                          fill
                          sizes="(min-width: 768px) 11rem, 9rem"
                          className="object-cover object-center"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className="inline-flex max-w-full items-center rounded-full border border-[#d8e7e5] bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#7fa8b2] leading-[1.2] whitespace-nowrap">
                      {member.role}
                    </span>
                    <h3 className="mt-4 text-[1.05rem] md:text-[1.15rem] font-black text-[#0e4a5a] uppercase tracking-tight leading-[1.08]">{member.name}</h3>
                    <p className="mt-4 text-[0.98rem] text-[#435a61] font-normal leading-relaxed max-w-[32ch]">{member.bio}</p>
                    <div className="mt-7 pt-4 border-t border-[#e0eceb] text-[10px] text-[#7fa8b2] font-black uppercase tracking-[0.18em]">
                      {member.since}
                    </div>
                  </div>
                </div>
              </Card3D>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA Final */}
      <section className="bg-[#072a33] text-white py-24 px-6 relative overflow-hidden text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle,_rgba(0,212,224,0.12)_0%,_transparent_60%)] pointer-events-none" />
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="text-[#00d4e0] text-xs font-black uppercase tracking-widest mb-4 block">Faça parte</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight uppercase mb-8">
            Construa sua próxima fase com apoio real.
          </h2>
          <p className="text-white/70 font-light text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Converse com nossa equipe e entenda como a DuoLife pode alavancar os fechamentos de seguros e benefícios corporativos da sua corretora.
          </p>
          <div className="flex justify-center">
            <Link 
              href="/seja-parceiro" 
              className="bg-[#00d4e0] hover:bg-[#00b2be] text-[#072a33] px-10 py-5 rounded-full font-black text-sm transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-[#00d4e0]/10"
            >
              Fazer Cadastro de Parceiro
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
