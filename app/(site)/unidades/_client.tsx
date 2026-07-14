'use client';

import React from 'react';
import Image from 'next/image';
import { Building2, FlaskConical, MapPin, Waves } from 'lucide-react';
import InternalPageHero from '@/components/site/InternalPageHero';

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
    type: 'Base Comercial',
    note: 'Ponto de apoio para reuniões com parceiros, alinhamentos comerciais e relacionamento institucional na região norte de Santa Catarina.',
  },
  {
    name: 'Centro Empresarial Corporate Park',
    address: 'Rod. José Carlos Daux, 8600 — Bloco 3, Sala 3',
    neighborhood: 'Santo Antônio de Lisboa',
    city: 'Florianópolis — SC',
    cep: '88050-000',
    maps: 'https://maps.google.com/?q=Rod.+José+Carlos+Daux,+8600,+Florianópolis,+SC',
    icon: Waves,
    image: '/duolife-sc-cities.jpg',
    type: 'Base Executiva',
    note: 'Estrutura de atendimento para reuniões estratégicas, conexões com operadoras e apoio à operação regional da Grande Florianópolis.',
  },
  {
    name: 'CDTEC — Condomínio de Desenvolvimento Tecnológico',
    address: 'Rua São Paulo, 31 — Sala 06',
    neighborhood: 'Centro',
    city: 'Joinville — SC',
    cep: '89202-200',
    maps: 'https://maps.google.com/?q=Rua+São+Paulo,+31,+Joinville,+SC',
    icon: FlaskConical,
    image: '/duolife-office.jpg',
    type: 'Base Operacional',
    note: 'Unidade voltada ao suporte técnico-operacional e à coordenação das demandas do parceiro no dia a dia.',
  },
];

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
      <InternalPageHero
        badge="Nossas Sedes"
        imageSrc="/duolife-sc-cities.jpg"
        imageClassName="object-cover object-[50%_34%]"
        title={
          <>
            Presença em <span className="text-gradient-shimmer font-black">Santa Catarina</span>. Atendimento nacional.
          </>
        }
        description="Unidades em Joinville e Florianópolis dão base para uma operação próxima, com suporte técnico e operacional de excelência para corretores parceiros em todo o Brasil."
      />

      {/* Grid de Unidades */}
      <section className="py-28 px-6 bg-surface border-b border-border">
        <div className="w-[min(92%,1800px)] mx-auto">
          <div className="mb-16 grid gap-6 md:grid-cols-3">
            {[
              { value: '3', label: 'bases de atendimento em SC' },
              { value: '2', label: 'cidades estratégicas de operação' },
              { value: 'Brasil', label: 'cobertura comercial apoiada pelas unidades' },
            ].map((item) => (
              <div key={item.label} className="rounded-[28px] border border-border bg-white p-6 shadow-[0_18px_50px_rgba(14,74,90,0.06)] text-left">
                <div className="text-4xl font-black leading-none tracking-tight text-primary">{item.value}</div>
                <div className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-secondary">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {units.map((unit) => {
              const Icon = unit.icon;
              return (
                <Card3D 
                  className="bg-white border border-border rounded-3xl p-6 shadow-[0_20px_55px_rgba(14,74,90,0.08)] hover:shadow-[0_26px_65px_rgba(14,74,90,0.12)] transition-shadow flex flex-col justify-between text-left" 
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
                      <div className="absolute left-4 bottom-4 inline-flex items-center rounded-full border border-white/40 bg-[#072a33]/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
                        {unit.type}
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
                    <p className="mt-5 border-t border-border pt-5 text-sm font-light leading-relaxed text-[#435a61]">
                      {unit.note}
                    </p>
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
        </div>
      </section>

      {/* Seção Abrangência */}
      <section className="py-28 px-6 bg-white">
        <div className="w-[min(92%,1800px)] mx-auto">
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
              <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/15 bg-[#072a33]/72 p-4 text-white backdrop-blur-md">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">Atendimento com presença regional</div>
                <p className="mt-2 text-sm font-light leading-relaxed text-white/82">
                  Reuniões estratégicas, relacionamento com parceiros e retaguarda técnico-operacional sustentados por uma base física em Santa Catarina.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
