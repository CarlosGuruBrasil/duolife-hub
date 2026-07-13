'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Building2, FlaskConical, MapPin, Waves, Sparkles, ArrowUpRight } from 'lucide-react';

const units = [
  {
    name: 'ACIJ — Associação Empresarial de Joinville',
    address: 'Av. Aluísio Pires Condeixa, 2550 — Sala 29',
    neighborhood: 'Saguaçu',
    city: 'Joinville — SC',
    cep: '89221-750',
    maps: 'https://maps.google.com/?q=Av.+Aluísio+Pires+Condeixa,+2550,+Joinville,+SC',
    icon: Building2,
    image: '/duolife-office.jpg',
  },
  {
    name: 'Centro Empresarial Corporate Park',
    address: 'Rod. José Carlos Daux, 8600 — Bloco 3, Sala 3',
    neighborhood: 'Santo Antônio de Lisboa',
    city: 'Florianópolis — SC',
    cep: '88050-000',
    maps: 'https://maps.google.com/?q=Rod.+José+Carlos+Daux,+8600,+Florianópolis,+SC',
    icon: Waves,
    image: '/duolife-team-meeting.jpg',
  },
  {
    name: 'CDTEC — Condomínio de Desenvolvimento Tecnológico',
    address: 'Rua São Paulo, 31 — Sala 06',
    neighborhood: 'Centro',
    city: 'Joinville — SC',
    cep: '89202-200',
    maps: 'https://maps.google.com/?q=Rua+São+Paulo,+31,+Joinville,+SC',
    icon: FlaskConical,
    image: '/duolife-partners-board.jpg',
  },
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
  return <div style={style} className={className}>{children}</div>;
}

export default function UnidadesClient() {
  return (
    <div className="bg-white text-primary-dark">

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-primary-dark text-white min-h-screen flex items-start">
        <Image src="/duolife-sc-cities.jpg" alt="" fill className="object-cover object-[50%_34%]" priority />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(0,212,224,0.18)_0%,transparent_36%),linear-gradient(180deg,rgba(7,42,51,0.72)_0%,rgba(7,42,51,0.8)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-primary-dark to-transparent" />

        <div className="relative z-10 w-[min(92%,1800px)] mx-auto px-6 pt-20 pb-20 lg:pt-28 lg:pb-24">
          <div className="max-w-[760px] text-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-accent px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-8 border border-white/5"
            >
              <Sparkles size={13} />
              Nossas Sedes
            </motion.div>
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="hero-title-wrap text-4xl md:text-6xl lg:text-[76px] xl:text-[84px] font-black tracking-[-0.03em] leading-[1.02] uppercase mb-6 text-gradient-shimmer drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
            >
              Presença em Santa Catarina. Atendimento nacional.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="text-base md:text-lg text-white/84 leading-relaxed font-light mb-10 max-w-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)]"
            >
              Unidades em Joinville e Florianópolis dão base para uma operação próxima, com suporte técnico e operacional de excelência para corretores parceiros em todo o Brasil.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Grid de Unidades */}
      <section className="py-28 px-6 bg-surface border-b border-border">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto"
        >
          <div className="grid md:grid-cols-3 gap-8">
            {units.map((unit) => {
              const Icon = unit.icon;
              return (
                <Card3D 
                  className="bg-white border border-border rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between text-left" 
                  key={unit.name}
                >
                  <div>
                    <div className="relative h-64 w-full rounded-2xl overflow-hidden mb-6 border border-border">
                      <Image
                        src={unit.image}
                        alt={unit.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 30vw"
                        className="object-cover object-top"
                      />
                      <div className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center text-primary shadow-sm">
                        <Icon size={20} />
                      </div>
                    </div>

                    <h2 className="mb-3 text-xl font-black leading-tight text-primary uppercase tracking-tight">
                      {unit.name}
                    </h2>
                    
                    <div className="muted space-y-1.5 text-sm text-[#4d686f] font-light">
                      <p>{unit.address}</p>
                      <p>{unit.neighborhood}</p>
                      <p className="font-bold text-primary">{unit.city}</p>
                      <p className="text-xs text-secondary">CEP {unit.cep}</p>
                    </div>
                  </div>

                  <a 
                    className="mt-6 rounded-2xl border-2 border-primary text-primary hover:bg-primary hover:text-white text-center py-3.5 text-xs font-black uppercase tracking-wider transition-all duration-300" 
                    href={unit.maps} 
                    rel="noopener noreferrer" 
                    target="_blank"
                  >
                    Ver no Google Maps
                  </a>
                </Card3D>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Seção Abrangência */}
      <section className="py-28 px-6 bg-white">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          className="w-[min(92%,1800px)] mx-auto"
        >
          <div className="grid lg:grid-cols-12 gap-16 items-center">

            <div className="lg:col-span-7 text-left">
              <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Abrangência</span>
              <h2 className="text-3xl md:text-5xl font-black text-primary uppercase leading-tight mb-6">Base regional, visão nacional.</h2>
              <p className="text-[#4d686f] font-light leading-relaxed text-lg mb-8">
                A DuoLife mantém presença física em pontos estratégicos de Santa Catarina e relacionamento comercial preferencial para apoiar corretores e consultores de seguros corporativos em diversas regiões do Brasil.
              </p>

              <div className="flex flex-wrap gap-2.5">
                {['Santa Catarina', 'Paraná', 'Rio Grande do Sul', 'São Paulo', 'Rio de Janeiro', 'Todo o Brasil'].map((region) => (
                  <span
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent/10 text-primary text-xs font-bold transition-all duration-300"
                    key={region}
                  >
                    <MapPin size={13} strokeWidth={2.5} /> {region}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 relative h-[380px] rounded-[32px] overflow-hidden shadow-xl border border-border">
              <Image
                src="/duolife-sc-cities.jpg"
                alt="Cidades de Santa Catarina atendidas pela DuoLife"
                fill
                sizes="(max-width: 768px) 100vw, 40vw"
                className="object-cover"
              />
            </div>

          </div>
        </motion.div>
      </section>

    </div>
  );
}
