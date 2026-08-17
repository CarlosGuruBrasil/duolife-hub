'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Headphones,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
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

const pillars = [
  {
    id: 'comercial',
    title: 'Suporte Comercial',
    desc: 'Alavancamos suas abordagens e negociações com estratégias de venda sob medida, abrindo portas e expandindo sua carteira de clientes de forma acelerada.',
    icon: BarChart3
  },
  {
    id: 'tecnico',
    title: 'Inteligência Técnico-Operacional',
    desc: 'Oferecemos capacitação contínua, análise detalhada e confecção técnica de propostas complexas para dar a segurança necessária no fechamento.',
    icon: ClipboardList
  },
  {
    id: 'operacional',
    title: 'Back-office Administrativo',
    desc: 'Terceirizamos a burocracia. Assumimos o cadastro de propostas, acompanhamento de emissões e cobrança administrativa para que você tenha mais tempo livre.',
    icon: ShieldCheck
  },
  {
    id: 'posvenda',
    title: 'Pós-Venda & Relacionamento',
    desc: 'Garantimos a intermediação ágil de sinistros, renovações e manutenções com operadoras de saúde e seguradoras, garantindo a retenção da sua base.',
    icon: Headphones
  }
];

const steps = [
  {
    num: '01',
    title: 'Acolhimento de Demandas',
    desc: 'Você nos envia a sua demanda comercial ou operacional. Nossa equipe assume a retaguarda imediatamente, analisando o melhor caminho e operadoras disponíveis.'
  },
  {
    num: '02',
    title: 'Confecção Técnica e Negociação',
    desc: 'Elaboramos estudos de mercado, cotações comparativas e relatórios técnicos aprofundados. Oferecemos o suporte necessário para que você apresente a melhor solução.'
  },
  {
    num: '03',
    title: 'Implantação e Pós-Venda Ativo',
    desc: 'Cuidamos do fechamento do contrato, conferência de documentação e acompanhamento contínuo. Se o seu cliente precisar de atendimento, a DuoLife resolve.'
  }
];

const testimonials = [
  {
    text: 'A DuoLife se tornou uma extensão da nossa corretora, atuando de forma estratégica no processo de venda e em situações de pós-venda. É uma parceria sólida baseada em confiança.',
    author: 'Consultare',
    role: 'Corretora Parceira'
  },
  {
    text: 'Melhor decisão que tomamos foi poder contar com a assessoria da DuoLife. Eles são extremamente eficientes no back-office, liberando nosso time para focar puramente em vendas.',
    author: 'Investseguros',
    role: 'Assessoria de Benefícios'
  },
  {
    text: 'Sempre demonstram proatividade, empatia e comprometimento em buscar soluções junto às operadoras de saúde. A parceria com a DuoLife é extremamente valiosa para nós.',
    author: 'Silxan Corretora',
    role: 'Corretora de Seguros'
  }
];

const metrics = [
  { value: '+180', label: 'corretores e consultores parceiros' },
  { value: 'Brasil', label: 'atuação comercial nacional' },
  { value: 'Direto', label: 'relacionamento com seguradoras' },
  { value: '3', label: 'unidades físicas de atendimento' }
];

const units = [
  {
    title: 'Centro Empresarial Corporate Park',
    address: 'Rodovia José Carlos Daux, 8600 — Bloco 3, Sala 3, Santo Antônio de Lisboa, Florianópolis/SC',
    city: 'Florianópolis'
  },
  {
    title: 'ACIJ — Associação Empresarial de Joinville',
    address: 'Av. Aluísio Pires Condeixa, 2550 — Sala 29, Saguaçu, Joinville/SC',
    city: 'Joinville'
  },
  {
    title: 'CDTEC — Condomínio de Des. Tecnológico',
    address: 'Rua São Paulo, 31 — Sala 06, Centro, Joinville/SC',
    city: 'Joinville'
  }
];

const leadership = [
  {
    name: 'Ricardo Abramo Padua Mello',
    role: 'CEO / Sócio-Fundador',
    bio: 'Lidera a DuoLife desde a sua fundação em 1995, consolidando a marca como referência de qualidade e ética na distribuição de benefícios corporativos e estruturação técnica.',
    image: '/team/ricardo-abramo-padua-mello.png'
  },
  {
    name: 'Sandro Savio Petrucci Machado',
    role: 'Sócio-Gerente',
    bio: 'Com vasta experiência operacional e de mercado, integra a sociedade desde 2019 estruturando e liderando toda a operação do back-office e suporte técnico aos parceiros.',
    image: '/team/sandro-savio-petrucci-machado.png'
  },
  {
    name: 'Pedro Henrique Tavares Padua Mello',
    role: 'Gerente Comercial e Pós-Vendas',
    bio: 'Assume a gestão em 2026 com foco na expansão de carteiras, aproximação comercial com consultores do Sul e suporte direto de pós-vendas no dia a dia.',
    image: '/team/pedro-henrique-tavares-padua-mello.png'
  }
];

// Componente Wrapper para Efeito 3D Hover Tilt (Jeton-style)
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

export default function Home() {
  const [activeStep, setActiveStep] = useState(0);
  const [activeAnchor, setActiveAnchor] = useState('inicio');
  const [showDock, setShowDock] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', message: '' });
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Envio do formulário de captura rápida
  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormStatus('sending');
    try {
      const res = await fetch('/api/parceiros/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          company: form.company,
          message: form.message || 'Cadastro via formulário de contato rápido da Home Page.'
        }),
      });
      if (res.ok) {
        setFormStatus('sent');
        setForm({ name: '', email: '', phone: '', company: '', message: '' });
      } else {
        setFormStatus('error');
      }
    } catch {
      setFormStatus('error');
    }
  }

  // Monitorar scroll para atualizar a âncora ativa do menu de pílula
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        const shouldShowDock = window.scrollY > window.innerHeight * 0.7;
        const scrollPos = window.scrollY + 200;
        const solucoesSec = document.getElementById('solucoes');
        const comoAtuamosSec = document.getElementById('como-atuamos');
        const unidadesSec = document.getElementById('unidades');

        let nextAnchor = 'inicio';

        if (unidadesSec && scrollPos >= unidadesSec.offsetTop) {
          nextAnchor = 'unidades';
        } else if (comoAtuamosSec && scrollPos >= comoAtuamosSec.offsetTop) {
          nextAnchor = 'como-atuamos';
        } else if (solucoesSec && scrollPos >= solucoesSec.offsetTop) {
          nextAnchor = 'solucoes';
        }

        setShowDock((current) => (current === shouldShowDock ? current : shouldShowDock));
        setActiveAnchor((current) => (current === nextAnchor ? current : nextAnchor));
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Header transparente */}
      <Header transparent />

      <main className="site-shell bg-white relative">
        
        {/* ================= HERO SECTION (Foto full-bleed à direita) ================= */}
        <section id="inicio" className="relative isolate overflow-hidden bg-primary-dark text-white min-h-[100svh] flex items-start">
          <Image
            src="/duolife-hero-business.png"
            alt="DuoLife B2B Assessoria de Vendas"
            fill
            priority
            className="object-cover object-center lg:object-right-top scale-[1.02]"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(0,212,224,0.18)_0%,transparent_34%),linear-gradient(180deg,rgba(7,42,51,0.72)_0%,rgba(7,42,51,0.8)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary-dark to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,_transparent_1px),_linear-gradient(90deg,_rgba(255,255,255,0.012)_1px,_transparent_1px)] bg-[size:100px_100px] [mask-image:radial-gradient(ellipse_at_center,_white_70%,_transparent_100%)] pointer-events-none" />

          <div className="relative z-10 w-[min(92%,1800px)] mx-auto px-6 pt-28 pb-20 md:pt-20 md:pb-24 lg:pt-28 lg:pb-28">
            <div className="max-w-[760px] text-left">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-accent px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-8 border border-white/5 self-start shadow-[0_10px_30px_rgba(7,42,51,0.18)]">
                <Sparkles size={13} />
                Assessoria Técnico-Comercial B2B
              </div>

              <h1 className="hero-title-wrap text-4xl md:text-6xl lg:text-[76px] xl:text-[84px] font-black tracking-[-0.03em] leading-[1.02] uppercase mb-6 text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
                Mais foco nas Vendas. <span className="text-gradient-shimmer font-black">Menos burocracia</span>.
              </h1>

              <p className="text-base md:text-lg text-white/84 leading-relaxed font-light mb-10 max-w-xl text-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)]">
                Na DuoLife, somos Especialistas em Destravar Resultados. Oferecemos suporte completo — Comercial, Técnico, Operacional e de Pós-venda — para que corretores e consultores foquem no que fazem de melhor.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/seja-parceiro"
                  className="flex items-center justify-center gap-2 bg-accent hover:bg-[#00b2be] text-primary-dark px-10 py-5 rounded-full font-black text-sm transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-accent/10"
                >
                  Seja Nosso Parceiro
                  <ArrowRight size={16} />
                </Link>
                <a
                  href="https://wa.me/5547996486081?text=Olá! Gostaria de falar com o time comercial da DuoLife."
                  target="_blank"
                  rel="noopener"
                  className="flex items-center justify-center gap-2 bg-transparent border border-white/20 hover:border-white hover:bg-white/5 text-white px-10 py-5 rounded-full font-bold text-sm transition-all duration-300"
                >
                  <Phone size={15} />
                  Falar no WhatsApp
                </a>
              </div>
            </div>

            <div className="mt-14 inline-flex bg-primary-dark/60 backdrop-blur-xl border border-white/10 px-5 py-4 rounded-[24px] shadow-2xl max-w-[220px]">
              <div>
                <div className="text-accent font-black text-[2rem] tracking-tight leading-none">+180</div>
                <div className="text-[10px] text-white/80 uppercase font-black tracking-wider mt-1.5 font-sans">Corretores Parceiros ativos</div>
              </div>
            </div>
          </div>

        </section>


        {/* ================= NAVIGATION PILL (Jeton Floating Nav) ================= */}
        <div className={`floating-nav hidden md:flex transition-opacity duration-300 ${showDock ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <Link href="#inicio" className={activeAnchor === 'inicio' ? 'active' : ''} onClick={(e) => {
            e.preventDefault();
            document.getElementById('inicio')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Início
          </Link>
          <Link href="#solucoes" className={activeAnchor === 'solucoes' ? 'active' : ''} onClick={(e) => {
            e.preventDefault();
            document.getElementById('solucoes')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Frentes
          </Link>
          <Link href="#como-atuamos" className={activeAnchor === 'como-atuamos' ? 'active' : ''} onClick={(e) => {
            e.preventDefault();
            document.getElementById('como-atuamos')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Como Atuamos
          </Link>
          <Link href="#unidades" className={activeAnchor === 'unidades' ? 'active' : ''} onClick={(e) => {
            e.preventDefault();
            document.getElementById('unidades')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Unidades
          </Link>
        </div>


        {/* ================= SEÇÃO 2: QUEM SOMOS E LEGADO ================= */}
        <section id="sobre" className="py-20 md:py-32 px-6 bg-surface relative border-b border-border overflow-hidden scroll-mt-28">
          
          <div className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 items-center relative z-10">
            
            {/* Lado Esquerdo: Dados e História */}
            <div className="lg:col-span-7 flex flex-col justify-center text-left">
              <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Nossa Trajetória</span>
              <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight leading-[1.15] text-primary uppercase mb-6">
                Sua retaguarda de confiança desde 1995.
              </h2>
              <p className="text-[#4d686f] font-light leading-relaxed text-lg mb-6">
                Fundada pelo sócio Ricardo Abramo Padua Mello, a DuoLife Plataforma de Negócios LTDA atua há quase <strong className="font-black text-primary">30 anos</strong> como o elo de conexão estratégico entre corretores parceiros e as principais seguradoras e operadoras de saúde suplementar do Brasil.
              </p>
              <p className="text-[#4d686f] font-light leading-relaxed text-base mb-8">
                Nossa assessoria atua no acolhimento de corretores e consultores. Administramos saúde suplementar, benefícios corporativos e produtos securitários com terceirização ágil de processos e serviços inovadores de suporte comercial e técnico.
              </p>

              {/* Cards de Missão, Visão e Valores */}
              <div className="grid sm:grid-cols-3 gap-6 mt-4">
                <div className="bg-white border border-border rounded-2xl p-5 shadow-sm text-left">
                  <span className="text-[10px] font-black text-accent uppercase tracking-wider block mb-2">Missão</span>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">Impulsionar corretores com assessoria estratégica, tecnológica e acolhedora na jornada.</p>
                </div>
                <div className="bg-white border border-border rounded-2xl p-5 shadow-sm text-left">
                  <span className="text-[10px] font-black text-secondary uppercase tracking-wider block mb-2">Visão</span>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">Ser referência nacional unindo inovação, tecnologia e acolhimento no setor.</p>
                </div>
                <div className="bg-white border border-border rounded-2xl p-5 shadow-sm text-left">
                  <span className="text-[10px] font-black text-primary uppercase tracking-wider block mb-2">Valores</span>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">Ética inabalável, respeito mútuo, qualidade de entrega e inovação constante.</p>
                </div>
              </div>
            </div>

            {/* Lado Direito: Imagem de Escritório com Paralaxe Vertical */}
            <div className="lg:col-span-5 relative h-[500px] rounded-[36px] overflow-hidden border border-border shadow-2xl">
              <div className="absolute inset-0 h-full w-full">
                <Image
                  src="/duolife-office.jpg"
                  alt="Escritório DuoLife Florianópolis"
                  fill
                  className="object-cover object-bottom"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/60 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-8 left-8 right-8 bg-primary-dark/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl text-left text-white">
                <div className="text-xs font-black uppercase tracking-wider text-accent">Foco no Relacionamento</div>
                <p className="mt-2 text-xs font-light leading-relaxed text-white/90 font-sans">A DuoLife está sediada estrategicamente em Joinville e Florianópolis, SC, atendendo corretores do Sul e de todo o Brasil.</p>
              </div>
            </div>

          </div>
        </section>


        {/* ================= SEÇÃO 3: AS 4 FRENTES ================= */}
        <section id="solucoes" className="py-20 md:py-32 px-6 bg-white relative border-b border-border overflow-hidden scroll-mt-28">
          
          <div className="w-[min(92%,1800px)] mx-auto relative z-10">
            
            {/* Cabeçalho de Seção */}
            <div className="text-center max-w-2xl mx-auto mb-20">
              <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Nossas Frentes de Apoio</span>
              <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase">
                Destravando resultados de ponta a ponta.
              </h2>
              <p className="mt-4 text-sm text-[#4d686f] font-light leading-relaxed">
                Nós assumimos a burocracia técnica e operacional de cotações de saúde e seguros para que você tenha total foco em fechar novos negócios.
              </p>
            </div>

            {/* Grid com Cartões Estáveis (Efeito 3D Hover Tilt e Imagens Fixas) — lado a lado no desktop, 2 col no tablet, 1 col no mobile */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              
              {/* Card 1: Comercial */}
              <Card3D className="bg-surface border border-border rounded-3xl overflow-hidden shadow-md flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 h-auto min-h-[380px] text-left">
                <div className="relative w-full h-[260px]">
                  <Image src="/duolife-broker-success.jpg" alt="Suporte Comercial" fill className="object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/20" />
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-black text-primary uppercase tracking-tight mb-3 flex items-center gap-2">
                    <BarChart3 size={20} />
                    {pillars[0].title}
                  </h3>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">{pillars[0].desc}</p>
                </div>
              </Card3D>

              {/* Card 2: Técnico */}
              <Card3D className="bg-surface border border-border rounded-3xl overflow-hidden shadow-md flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 h-auto min-h-[380px] text-left">
                <div className="relative w-full h-[260px]">
                  <Image src="/duolife-strategy.jpg" alt="Inteligência Técnica" fill className="object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/10" />
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-black text-primary uppercase tracking-tight mb-3 flex items-center gap-2">
                    <ClipboardList size={20} />
                    {pillars[1].title}
                  </h3>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">{pillars[1].desc}</p>
                </div>
              </Card3D>

              {/* Card 3: Operacional */}
              <Card3D className="bg-surface border border-border rounded-3xl overflow-hidden shadow-md flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 h-auto min-h-[380px] text-left">
                <div className="relative w-full h-[260px]">
                  <Image src="/duolife-team-meeting.jpg" alt="Back-office Operacional" fill className="object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/10" />
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-black text-primary uppercase tracking-tight mb-3 flex items-center gap-2">
                    <ShieldCheck size={20} />
                    {pillars[2].title}
                  </h3>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">{pillars[2].desc}</p>
                </div>
              </Card3D>

              {/* Card 4: Pós-Venda */}
              <Card3D className="bg-surface border border-border rounded-3xl overflow-hidden shadow-md flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 h-auto min-h-[380px] text-left">
                <div className="relative w-full h-[260px]">
                  <Image src="/duolife-broker-client.jpg" alt="Pós-Venda" fill className="object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/20" />
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-black text-primary uppercase tracking-tight mb-3 flex items-center gap-2">
                    <Headphones size={20} />
                    {pillars[3].title}
                  </h3>
                  <p className="text-xs text-[#4d686f] font-light leading-relaxed">{pillars[3].desc}</p>
                </div>
              </Card3D>

            </div>

            <div className="text-center mt-16">
              <Link 
                href="/solucoes" 
                className="inline-flex items-center gap-2 text-sm font-black text-primary border-b-2 border-primary hover:text-accent hover:border-accent pb-1 transition-all duration-300"
              >
                Conhecer detalhadamente todas as frentes de apoio 
                <ArrowUpRight size={16} />
              </Link>
            </div>

          </div>
        </section>


        {/* ================= SEÇÃO 4: LIDERANÇA / EQUIPE ================= */}
        <section className="py-20 md:py-32 px-6 bg-surface border-b border-border relative">
          <div className="w-[min(92%,1800px)] mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-20">
              <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Nossa Liderança</span>
              <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase">
                Quem está por trás do suporte.
              </h2>
              <p className="mt-4 text-sm text-[#4d686f] font-light leading-relaxed">
                Conheça os diretores societários focados em aproximar relacionamentos e garantir a entrega com excelência técnica.
              </p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-8">
              {leadership.map((member) => (
                <Card3D 
                  key={member.name} 
                  className="group relative overflow-hidden rounded-[32px] border border-border bg-[linear-gradient(180deg,#ffffff_0%,#fbfefe_62%,#f5fbfb_100%)] p-8 md:p-10 shadow-[0_28px_80px_rgba(14,74,90,0.12)] flex h-full flex-col text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_34px_90px_rgba(14,74,90,0.18)]"
                >
                  <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />
                  <div className="flex h-full flex-col gap-7">
                    <div className="flex justify-center">
                      <div className="rounded-full bg-gradient-to-br from-primary/12 via-white to-accent/18 p-1.5 shadow-[0_18px_34px_rgba(14,74,90,0.12)]">
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
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-center">
                        <span className="inline-flex max-w-full items-center justify-center rounded-full border border-border bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-secondary leading-[1.2] whitespace-normal break-words text-center shadow-[0_8px_24px_rgba(14,74,90,0.06)]">
                          {member.role}
                        </span>
                      </div>
                      <h3 className="mt-4 text-[1.05rem] md:text-[1.15rem] font-black text-primary uppercase tracking-tight leading-[1.08]">{member.name}</h3>
                      <p className="mt-4 text-[0.98rem] text-[#435a61] font-normal leading-relaxed">{member.bio}</p>
                    </div>
                  </div>
                </Card3D>
              ))}
            </div>
          </div>
        </section>


        {/* ================= SEÇÃO 5: SUPORTE DO COMEÇO AO FIM ================= */}
        <section id="como-atuamos" className="bg-primary text-white py-20 md:py-32 px-6 relative overflow-hidden">

          <Image
            src="/duolife-consultant.jpg"
            alt=""
            fill
            className="object-cover object-top opacity-[0.18] pointer-events-none z-0"
          />
          <div className="absolute top-[30%] left-[-10%] w-[400px] h-[400px] bg-[radial-gradient(circle,_rgba(0,212,224,0.08)_0%,_transparent_65%)] pointer-events-none z-0" />

          <div className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 items-center relative z-10">
            
            {/* Lado Esquerdo - Mockup de Painel / Dashboard Minimalista com Efeito 3D */}
            <div className="lg:col-span-6 flex justify-center order-2 lg:order-1 relative z-10">
              <Card3D 
                className="w-full max-w-[480px] bg-primary-dark/60 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl relative overflow-hidden text-left"
              >
                {/* Header do Mockup */}
                <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded-full bg-accent" />
                    <span className="text-xs font-black uppercase tracking-wider text-white/80 text-left font-sans">DuoLife Partner Hub</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white/20" />
                    <span className="w-2 h-2 rounded-full bg-white/20" />
                    <span className="w-2 h-2 rounded-full bg-white/20" />
                  </div>
                </div>

                {/* Linhas de Gráfico */}
                <div className="space-y-6">
                  <div className="bg-white/5 rounded-2xl p-5 border border-white/5 hover:border-accent/20 transition-colors duration-300">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-white/60 font-semibold text-left">Parceiros Ativos</span>
                      <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">+180 Corretores</span>
                    </div>
                    <div className="text-2xl font-black tracking-tight text-white text-left">100% de Apoio</div>
                  </div>

                  {/* Fluxo / Etapas */}
                  <div className="space-y-3 text-left">
                    <span className="text-[10px] font-black tracking-widest text-white/60 uppercase">Demandas Recentes</span>
                    <div className="space-y-2">
                      {[
                        { title: 'Estudo Técnico de Saúde PME', state: 'Concluído', color: '#00d4e0' },
                        { title: 'Cotação de Seguro Garantia Corporativo', state: 'Emitido', color: '#7fa8b2' },
                        { title: 'Regulação de Sinistro - Assistência 24h', state: 'Em andamento', color: 'rgba(255,255,255,0.4)' }
                      ].map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-3 px-4 bg-white/[0.02] border border-white/5 rounded-xl text-xs">
                          <span className="text-white/80 font-medium">{item.title}</span>
                          <span className="font-bold flex items-center gap-1.5" style={{ color: item.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                            {item.state}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </Card3D>
            </div>

            {/* Lado Direito - Etapas (Steps) do Processo */}
            <div className="lg:col-span-6 flex flex-col order-1 lg:order-2 text-left max-w-[620px] relative z-10">
              <div className="mb-4 inline-flex w-fit items-center rounded-full border border-accent/25 bg-accent px-3 py-1 shadow-[0_10px_24px_rgba(0,212,224,0.18)]">
                <span className="text-xs font-black tracking-widest text-[#062832] uppercase">Como Atuamos</span>
              </div>
              <h2 className="max-w-[12ch] text-4xl md:text-[3.5rem] font-black tracking-tight leading-[1.12] uppercase mb-12 text-[#f8ffff] drop-shadow-[0_2px_12px_rgba(0,0,0,0.42)]">
                O elo em toda a <br />jornada de vendas.
              </h2>

              <div className="space-y-8">
                {steps.map((step, idx) => (
                  <div 
                    key={step.num}
                    className={`step-card cursor-pointer ${activeStep === idx ? 'active' : ''}`}
                    onClick={() => setActiveStep(idx)}
                  >
                    <div className="flex gap-4 items-baseline">
                      <span className="step-number">{step.num}</span>
                      <div>
                        <h3 className="text-lg font-black text-white/95 uppercase tracking-tight">{step.title}</h3>
                        <p className="mt-2 text-sm text-white/78 font-light leading-relaxed max-w-md">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>


        {/* ================= SEÇÃO 6: METRICS ROW ================= */}
        <section className="py-20 border-b border-border bg-white relative z-10">
          <div className="w-[min(92%,1800px)] mx-auto px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 text-center divide-y sm:divide-y-0 md:divide-x divide-border">
              {metrics.map((metric, i) => (
                <div className="flex flex-col items-center justify-center pt-6 md:pt-0 md:px-4" key={metric.label}>
                  <strong className="text-4xl md:text-6xl font-black text-primary leading-none tracking-tight">{metric.value}</strong>
                  <span className="text-xs text-[#4d686f] mt-3 font-semibold uppercase tracking-wider max-w-[170px]">{metric.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* ================= SEÇÃO 7: DEPOIMENTOS ================= */}
        <section className="py-20 md:py-32 px-6 bg-surface relative overflow-hidden">
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Depoimentos</span>
            <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase mb-16">
              Quem cresce conosco.
            </h2>

            {/* Testimonials Stack */}
            <div className="grid md:grid-cols-3 gap-8 text-left">
              {testimonials.map((t) => (
                <Card3D 
                  key={t.author}
                  className="bg-white border border-border rounded-3xl p-8 shadow-md flex flex-col justify-between hover:shadow-lg transition-all duration-300"
                >
                  <div>
                    <div className="flex gap-1 text-accent mb-6">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={15} fill="currentColor" stroke="none" />
                      ))}
                    </div>
                    <p className="text-sm text-[#4d686f] font-light leading-relaxed italic">
                      "{t.text}"
                    </p>
                  </div>
                  <div className="mt-8 pt-4 border-t border-border flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-black text-sm">
                      {t.author.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-primary">{t.author}</h4>
                      <span className="text-[10px] text-[#7c959c] font-bold uppercase tracking-wider">{t.role}</span>
                    </div>
                  </div>
                </Card3D>
              ))}
            </div>
          </div>
        </section>


        {/* ================= SEÇÃO 8: UNIDADES ================= */}
        <section id="unidades" className="py-20 md:py-32 px-6 bg-white border-t border-border relative scroll-mt-28">
          <div className="w-[min(92%,1800px)] mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Nossas Sedes</span>
              <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase">
                Onde estamos fisicamente.
              </h2>
              <p className="mt-4 text-sm text-[#4d686f] font-light">
                Apoiamos parceiros e consultores em Joinville e Florianópolis, cobrindo com excelência toda a região Sul e o Brasil.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {units.map((unit, idx) => (
                <Card3D 
                  key={idx} 
                  className="bg-surface border border-border rounded-3xl p-8 flex flex-col justify-between hover:border-primary/20 transition-all duration-300 text-left"
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center mb-6">
                      <MapPin size={20} />
                    </div>
                    <span className="text-[10px] font-black uppercase text-secondary tracking-wider mb-2 block">{unit.city}</span>
                    <h3 className="text-lg font-black text-primary uppercase leading-tight mb-4">{unit.title}</h3>
                    <p className="text-xs text-[#4d686f] leading-relaxed font-light mb-6">{unit.address}</p>
                  </div>
                  <a 
                    href={`https://maps.google.com/?q=${encodeURIComponent(unit.title + ' ' + unit.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-black text-primary hover:text-accent transition-colors self-start"
                  >
                    Ver no Google Maps
                    <ArrowUpRight size={14} />
                  </a>
                </Card3D>
              ))}
            </div>
          </div>
        </section>


        {/* ================= SEÇÃO 9: FORMULÁRIO DE CAPTURA RÁPIDA ================= */}
        <section id="contato-lead" className="py-20 md:py-32 px-6 bg-surface border-t border-border relative overflow-hidden scroll-mt-28">
          
          <div className="absolute top-[40%] right-[-10%] w-[350px] h-[350px] bg-accent/4 rounded-full blur-3xl pointer-events-none" />

          <div className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 items-center">
            
            {/* Lado Esquerdo - Apelo Comercial */}
            <div className="lg:col-span-6 text-left">
              <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Fale Conosco</span>
              <h2 className="text-4xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase mb-6 leading-tight">
                Pronto para destravar seus resultados?
              </h2>
              <p className="text-[#4d686f] font-light leading-relaxed text-lg mb-8">
                Preencha o formulário ao lado e nosso time comercial entrará em contato em menos de 24 horas úteis para apresentar todas as vantagens da assessoria DuoLife.
              </p>

              <div className="space-y-4">
                {[
                  { title: 'Suporte Comercial Ativo', desc: 'Auxílio completo em prospecção, estratégias e fechamento de novos contratos.' },
                  { title: 'Back-office Ágil', desc: 'Conferência, digitação rápida de propostas e pós-venda estruturado.' }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0 mt-1">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-primary uppercase tracking-tight">{item.title}</h4>
                      <p className="text-xs text-[#4d686f] mt-1 font-light">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lado Direito - Formulário de Captura */}
            <div className="lg:col-span-6">
              <Card3D className="bg-white border border-border rounded-[36px] p-8 md:p-10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-[radial-gradient(circle,_rgba(0,212,224,0.06)_0%,_transparent_60%)] pointer-events-none" />
                
                <h3 className="text-xl md:text-2xl font-black text-primary uppercase tracking-tight mb-2">Solicitar Atendimento</h3>
                <p className="text-[#4d686f] text-xs font-light mb-6">Preencha os campos abaixo e retornaremos em menos de 24h.</p>
                
                {formStatus === 'sent' ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-accent/10 text-primary flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 size={30} />
                    </div>
                    <p className="font-black text-primary uppercase tracking-wider text-sm">Solicitação Recebida!</p>
                    <p className="text-[#4d686f] text-xs font-light mt-2">Nossa equipe comercial entrará em contato em breve.</p>
                  </div>
                ) : (
                  <form onSubmit={handleLeadSubmit} className="space-y-4 text-left">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-black text-primary uppercase tracking-wider mb-1.5">Seu Nome *</label>
                        <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-xs text-primary placeholder-secondary/60 focus:outline-none focus:border-accent transition-colors" placeholder="Ex: Carlos Santos" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-primary uppercase tracking-wider mb-1.5">E-mail Corporativo *</label>
                        <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-xs text-primary placeholder-secondary/60 focus:outline-none focus:border-accent transition-colors" placeholder="joao@empresa.com" />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-black text-primary uppercase tracking-wider mb-1.5">WhatsApp *</label>
                        <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-xs text-primary placeholder-secondary/60 focus:outline-none focus:border-accent transition-colors" placeholder="(47) 99999-9999" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-primary uppercase tracking-wider mb-1.5">Nome da Corretora *</label>
                        <input required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-xs text-primary placeholder-secondary/60 focus:outline-none focus:border-accent transition-colors" placeholder="Silva Seguros" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black text-primary uppercase tracking-wider mb-1.5">Mensagem / Dúvida</label>
                      <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-xs text-primary placeholder-secondary/60 focus:outline-none focus:border-accent transition-colors" rows={3} placeholder="Descreva brevemente sua necessidade..." />
                    </div>

                    {formStatus === 'error' && (
                      <p className="text-red-500 text-xs font-semibold">Erro ao enviar solicitação. Tente novamente.</p>
                    )}

                    <button type="submit" disabled={formStatus === 'sending'} className="w-full bg-accent hover:bg-[#00b2be] disabled:bg-secondary text-primary-dark py-4 rounded-full font-black text-xs uppercase tracking-wider shadow-md shadow-accent/10 transition-colors">
                      {formStatus === 'sending' ? 'Enviando...' : 'Enviar Solicitação de Parceria'}
                    </button>
                  </form>
                )}
              </Card3D>
            </div>

          </div>
        </section>


        {/* ================= CTA FINAL ================= */}
        <section className="bg-primary-dark text-white py-24 px-6 relative overflow-hidden text-center border-t border-white/5">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,_rgba(0,212,224,0.12)_0%,_transparent_60%)] pointer-events-none" />
          
          <div className="max-w-3xl mx-auto relative z-10">
            <span className="text-accent text-xs font-black uppercase tracking-widest mb-4 block">Pronto para Começar?</span>
            <h2 className="text-4xl md:text-7xl font-black tracking-tight uppercase leading-[1.15] mb-8">
              +180 consultores de excelência. <br />E você?
            </h2>
            <p className="text-white/70 font-light text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              Descubra como a DuoLife Hub pode organizar seu fluxo operacional, liberar o seu tempo e turbinar suas vendas de seguros e benefícios.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                href="/seja-parceiro" 
                className="bg-accent hover:bg-[#00b2be] text-primary-dark px-10 py-5 rounded-full font-black text-sm transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-accent/10"
              >
                Fazer Cadastro de Parceiro
              </Link>
              <Link 
                href="/solucoes" 
                className="bg-transparent border border-white/20 hover:border-white hover:bg-white/5 text-white px-10 py-5 rounded-full font-bold text-sm transition-all duration-300"
              >
                Conhecer Nossos Serviços
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* Footer principal */}
      <Footer />
    </>
  );
}
