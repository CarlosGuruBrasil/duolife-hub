'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Handshake,
  Headphones,
  Laptop,
  ShieldCheck,
  TriangleAlert,
  Zap,
  Sparkles,
  Phone,
  ArrowUpRight,
  TrendingDown,
  Check
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const pillars = [
  {
    icon: Handshake,
    title: 'Suporte Comercial',
    desc: 'Estratégias de venda de seguros de saúde suplementar, expansão de carteira de benefícios corporativos e apoio integral em negociações.',
    items: ['Abordagem e fechamento de novos negócios', 'Estratégia de expansão de carteiras', 'Apoio especializado em negociações complexas'],
    image: '/duolife-broker-success.jpg'
  },
  {
    icon: ClipboardList,
    title: 'Suporte Técnico',
    desc: 'Capacitação especializada, estudos de mercado detalhados e elaboração de propostas estruturadas para dar segurança no fechamento.',
    items: ['Capacitação técnica contínua', 'Revisão detalhada de propostas', 'Consultoria e treinamento sobre produtos'],
    image: '/duolife-strategy.jpg'
  },
  {
    icon: ShieldCheck,
    title: 'Suporte Operacional',
    desc: 'Retaguarda para conferência de documentos cadastrais, cadastros ágeis, emissão rápida e acompanhamento cuidadoso de etapas.',
    items: ['Gestão de documentos cadastrais', 'Emissão rápida e endossos', 'Controle e follow-up de renovações'],
    image: '/duolife-team-meeting.jpg'
  },
  {
    icon: Headphones,
    title: 'Pós-Venda Especializado',
    desc: 'Acompanhamento de sinistros, renovações e manutenções com operadoras de saúde para retenção absoluta do seu cliente final.',
    items: ['Intermediação rápida com operadoras', 'Suporte direto ao cliente do corretor', 'Relacionamento contínuo de fidelização'],
    image: '/duolife-broker-client.jpg'
  },
];

const challenges = [
  { title: 'Falta de Capacitação', desc: 'Dificuldade para dominar produtos complexos de saúde, odontológico e seguros de vida.' },
  { title: 'Burocracia excessiva', desc: 'Processos lentos de cadastro, emissão e conferência de contratos corporativos.' },
  { title: 'Lentidão no suporte', desc: 'Falta de respostas rápidas das operadoras para sanar dúvidas urgentes.' },
  { title: 'Dificuldade para escalar', desc: 'Tempo comercial engolido pelo pós-venda e operacional administrativo do dia a dia.' },
];

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
  style?: any;
}

function Card3D({ children, className = '', style = {} }: Card3DProps) {
  return <div style={style} className={className}>{children}</div>;
}

export default function SolucoesClient() {
  return (
    <div className="bg-[#ffffff] text-[#072a33]">

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-[#072a33] text-[#ffffff] min-h-screen flex items-start">
        <Image src="/duolife-strategy.jpg" alt="" fill className="object-cover object-[50%_24%]" priority />
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
              Nossas Soluções
            </motion.div>
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="hero-title-wrap-wide hero-title-wrap text-4xl md:text-6xl lg:text-[76px] xl:text-[84px] font-black tracking-[-0.03em] leading-[1.02] uppercase mb-6 text-gradient-shimmer drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
            >
              <span className="block">Suporte completo para os seus</span>
              <span className="block">negócios fluírem.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="text-base md:text-lg text-white/84 leading-relaxed font-light mb-10 max-w-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)]"
            >
              A DuoLife atua como a retaguarda estratégica de corretores e consultores, fornecendo capacitação comercial e técnica para acelerar a contratação de benefícios.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Desafios do Mercado */}
      <section className="py-28 px-6 bg-white border-b border-[#e0eceb]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto"
        >
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-[#ef4444] uppercase mb-6 block">Fricção no Dia a Dia</span>
            <h2 className="text-3xl md:text-5.5xl font-black tracking-tight text-[#0e4a5a] uppercase">
              Onde o corretor perde velocidade.
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {challenges.map((challenge) => (
              <div
                className="bg-red-50/50 rounded-3xl p-6 border border-red-100 flex flex-col justify-between"
                key={challenge.title}
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 mb-5">
                    <TriangleAlert size={18} />
                  </div>
                  <h3 className="text-lg font-black text-red-950 uppercase tracking-tight leading-tight mb-2">{challenge.title}</h3>
                  <p className="text-xs text-red-900 font-light leading-relaxed">{challenge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Os 4 Pilares da Assessoria */}
      <section className="py-28 px-6 bg-[#f7faf9] border-b border-[#e0eceb]">
        <div className="w-[min(92%,1800px)] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={fadeUp}
            className="text-center max-w-2xl mx-auto mb-20"
          >
            <span className="text-xs font-black tracking-widest text-[#0e4a5a] uppercase mb-6 block">Modelo DuoLife</span>
            <h2 className="text-4xl md:text-5.5xl font-black tracking-tight text-[#0e4a5a] uppercase">
              Assessoria em Quatro Frentes
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 gap-8"
          >
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <motion.div key={pillar.title} variants={fadeUp}>
                  <Card3D
                    className="bg-white rounded-[32px] overflow-hidden border border-[#d7e3df] shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group h-auto min-h-[500px]"
                  >
                    <div className="relative w-full h-[250px]">
                      <Image src={pillar.image} alt={pillar.title} fill className="object-cover object-top" />
                      <div className="absolute inset-0 bg-[#0e4a5a]/20" />
                    </div>

                    <div className="p-8 text-left flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex gap-4 items-center mb-4">
                          <div className="w-10 h-10 bg-[#0e4a5a]/5 rounded-xl flex items-center justify-center text-[#0e4a5a]">
                            <Icon size={18} />
                          </div>
                          <h3 className="text-2xl font-black text-[#0e4a5a] uppercase tracking-tight">{pillar.title}</h3>
                        </div>
                        <p className="text-sm text-[#4d686f] font-light leading-relaxed mb-6">{pillar.desc}</p>
                      </div>

                      <ul className="space-y-3 pt-6 border-t border-[#edf4f2]">
                        {pillar.items.map((item) => (
                          <li key={item} className="flex items-center gap-2.5 text-xs text-[#0e4a5a] font-bold">
                            <div className="w-4 h-4 rounded-full bg-[#00d4e0]/10 flex items-center justify-center text-[#00d4e0]">
                              <Check size={10} strokeWidth={3} />
                            </div>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Card3D>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Produto em Destaque: Responsabilidade Civil */}
      <section className="py-28 px-6 bg-[#ffffff]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto bg-[#0e4a5a] rounded-[48px] p-8 md:p-16 text-white grid lg:grid-cols-12 gap-12 items-center relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[radial-gradient(circle,_rgba(0,212,224,0.15)_0%,_transparent_60%)] pointer-events-none" />
          
          <div className="lg:col-span-7 text-left relative z-10">
            <span className="text-[#00d4e0] text-xs font-black uppercase tracking-widest mb-4 block">Seguro RC em Foco</span>
            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-tight mb-6">
              Seguro de Responsabilidade Civil Profissional (RC).
            </h2>
            <p className="text-white/80 font-light leading-relaxed text-base mb-8">
              Proteja o patrimônio e a carreira de profissionais como médicos, dentistas, advogados e engenheiros. Oferecemos um fluxo simplificado para você orçar, negociar e emitir apólices de RC de forma rápida e segura direto pelo portal do parceiro DuoLife.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {[
                'Cotação rápida e simplificada',
                'Modelos de coberturas sob medida',
                'Comissões diferenciadas',
                'Atendimento operacional especializado'
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs font-bold text-white/90">
                  <div className="w-4.5 h-4.5 rounded-full bg-[#00d4e0]/20 text-[#00d4e0] flex items-center justify-center">
                    <Check size={11} strokeWidth={3} />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 relative h-[320px] rounded-[32px] overflow-hidden border border-white/10 shadow-xl">
            <Image src="/duolife-team-success.jpg" alt="Seguro RC DuoLife" fill className="object-cover" />
          </div>
        </motion.div>
      </section>

      {/* CTA Final */}
      <section className="bg-[#072a33] text-white py-24 px-6 relative overflow-hidden text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle,_rgba(0,212,224,0.12)_0%,_transparent_60%)] pointer-events-none" />
        <div className="max-w-3xl mx-auto relative z-10">
          <span className="text-[#00d4e0] text-xs font-black uppercase tracking-widest mb-4 block">Parceria Ativa</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight uppercase mb-8">
            Vamos destravar seus resultados juntos?
          </h2>
          <p className="text-white/70 font-light text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Cadastre-se na nossa assessoria e tenha total suporte técnico e operacional nas suas cotações e renovações corporativas.
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
