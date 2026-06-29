'use client';

import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Headphones,
  MapPin,
  Settings,
  Shield,
  Sparkles,
  Star,
} from 'lucide-react';

const smoothEase = [0.22, 1, 0.36, 1] as const;

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.65, delay, ease: smoothEase },
});

const pillars = [
  {
    icon: BarChart3,
    title: 'Comercial',
    kicker: 'Venda com direção',
    desc: 'Estratégia, abordagem e suporte para transformar relacionamento em oportunidade real.',
  },
  {
    icon: Settings,
    title: 'Técnico',
    kicker: 'Proposta sem ruído',
    desc: 'Capacitação, análise e preparação de proposta com mais clareza para o corretor.',
  },
  {
    icon: Shield,
    title: 'Operacional',
    kicker: 'Back-office forte',
    desc: 'Acompanhamento de processos, documentos e burocracias que drenam tempo da venda.',
  },
  {
    icon: Headphones,
    title: 'Pós-venda',
    kicker: 'Cliente assistido',
    desc: 'Intermediação com operadoras e seguradoras para manter a parceria saudável depois do contrato.',
  },
];

const metrics = [
  ['+180', 'corretores parceiros'],
  ['~10', 'anos de mercado'],
  ['3', 'unidades em SC'],
  ['4', 'pilares de suporte'],
];

const journey = [
  'Diagnóstico comercial',
  'Apoio técnico',
  'Cotação e proposta',
  'Operação assistida',
  'Pós-venda contínuo',
];

const testimonials = [
  {
    text: 'A DuoLife se tornou uma extensão da nossa corretora, atuando de forma estratégica não apenas no processo de venda, mas também em diversas situações de pós-venda.',
    author: 'Consultare',
  },
  {
    text: 'Melhor coisa que tive foi poder contar com a assessoria de vocês. Vocês são feras, muito obrigado mesmo.',
    author: 'Investseguros',
  },
  {
    text: 'Sempre demonstram proatividade, empatia e comprometimento em buscar soluções. A parceria com vocês é extremamente valiosa para nós.',
    author: 'Silxan Corretora',
  },
];

export default function Home() {
  const { scrollYProgress } = useScroll();
  const heroImageY = useTransform(scrollYProgress, [0, 0.35], [0, 95]);
  const heroPanelY = useTransform(scrollYProgress, [0, 0.35], [0, -50]);
  const partnerImageY = useTransform(scrollYProgress, [0.25, 0.8], [35, -35]);

  return (
    <>
      <Header />
      <main className="site-shell">
        <section className="hero-section">
          <motion.div className="hero-media" style={{ y: heroImageY }}>
            <Image
              src="/duolife-hero-business.png"
              alt="Ambiente corporativo premium com consultores analisando soluções de seguros e benefícios"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </motion.div>
          <div className="hero-scrim" />

          <div className="hero-content">
            <motion.div {...reveal(0)} className="hero-copy">
              <span className="eyebrow">DuoLife Hub de Negócios</span>
              <h1 className="hero-title">
                Benefícios corporativos<br />
                com operação de verdade.
              </h1>
              <p className="hero-lead">
                Assessoria para corretores e consultores venderem mais, com suporte comercial,
                técnico, operacional e pós-venda em uma jornada única.
              </p>
              <div className="hero-actions">
                <Link href="/seja-parceiro" className="btn-accent hero-cta">
                  Seja Nosso Parceiro <ArrowRight size={16} />
                </Link>
                <Link href="/solucoes" className="hero-link">
                  Ver soluções <ChevronRight size={16} />
                </Link>
              </div>
            </motion.div>

            <motion.div className="hero-insight" style={{ y: heroPanelY }} {...reveal(0.12)}>
              <Image src="/logo-vertical.png" alt="DuoLife" width={96} height={96} className="hero-mark" />
              <div>
                <p className="hero-insight-label">Jornada assistida</p>
                <p className="hero-insight-value">Da prospecção ao pós-venda</p>
              </div>
              <div className="hero-progress">
                {journey.map((step, index) => (
                  <span key={step} className={index < 4 ? 'is-active' : ''} />
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section className="metrics-band" aria-label="Números DuoLife">
          <div className="metrics-grid">
            {metrics.map(([value, label], index) => (
              <motion.div key={label} {...reveal(index * 0.05)} className="metric-item">
                <strong>{value}</strong>
                <span>{label}</span>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="split-section">
          <motion.div {...reveal(0)} className="section-copy">
            <span className="eyebrow">Nossa função</span>
            <h2 className="section-title">
              Destravar vendas<br />
              sem inflar sua operação.
            </h2>
            <p>
              O corretor não precisa carregar sozinho análise, proposta, documentação, acompanhamento
              e pós-venda. A DuoLife entra como extensão operacional e comercial para manter a venda em movimento.
            </p>
            <div className="check-list">
              {['Menos retrabalho entre proposta e fechamento', 'Mais previsibilidade no atendimento', 'Suporte prático para corretores parceiros'].map((item) => (
                <span key={item}><CheckCircle2 size={17} /> {item}</span>
              ))}
            </div>
          </motion.div>

          <motion.div {...reveal(0.1)} className="image-stack">
            <motion.div className="partner-board" style={{ y: partnerImageY }}>
              <Image
                src="/duolife-partners-board.jpg"
                alt="Painel DuoLife com parceiros de saúde e seguros"
                fill
                sizes="(max-width: 768px) 100vw, 44vw"
                className="object-cover"
              />
            </motion.div>
            <div className="floating-note">
              <Sparkles size={16} />
              <span>Ecossistema de saúde, seguros e benefícios em uma relação de parceria.</span>
            </div>
          </motion.div>
        </section>

        <section className="pillars-section">
          <motion.div {...reveal(0)} className="section-heading">
            <span className="eyebrow">Como a DuoLife atua</span>
            <h2 className="section-title">
              Quatro pilares<br />
              para uma venda completa.
            </h2>
          </motion.div>

          <div className="pillar-grid">
            {pillars.map((pillar, index) => (
              <motion.article key={pillar.title} {...reveal(index * 0.07)} className="pillar-card">
                <div className="pillar-icon"><pillar.icon size={22} /></div>
                <span>{pillar.kicker}</span>
                <h3>{pillar.title}</h3>
                <p>{pillar.desc}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="rc-section">
          <div className="rc-visual" aria-hidden="true">
            <div className="rc-document">
              <span>RC Profissional</span>
              <strong>Proposta em análise</strong>
              <div />
              <div />
              <div />
            </div>
          </div>
          <motion.div {...reveal(0)} className="rc-copy">
            <span className="eyebrow on-dark">Produto em destaque</span>
            <h2>
              Seguro RC<br />
              com suporte de ponta a ponta.
            </h2>
            <p>
              Corretores parceiros acessam o portal para registrar cotações, acompanhar etapas e centralizar
              a jornada comercial com apoio da equipe DuoLife.
            </p>
            <Link href="/portal" className="dark-action">
              Acessar portal <ArrowRight size={16} />
            </Link>
          </motion.div>
        </section>

        <section className="testimonials-section">
          <motion.div {...reveal(0)} className="section-heading">
            <span className="eyebrow">Prova social</span>
            <h2 className="section-title">
              Parceria percebida<br />
              no dia a dia.
            </h2>
          </motion.div>

          <div className="testimonial-grid">
            {testimonials.map((testimonial, index) => (
              <motion.article key={testimonial.author} {...reveal(index * 0.08)} className="testimonial-card">
                <div className="stars">
                  {[...Array(5)].map((_, star) => <Star key={star} size={14} fill="currentColor" />)}
                </div>
                <p>"{testimonial.text}"</p>
                <strong>{testimonial.author}</strong>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="locations-cta">
          <div>
            <span className="eyebrow">Presença em SC</span>
            <h2 className="section-title">
              Joinville e Florianópolis<br />
              com atuação nacional.
            </h2>
          </div>
          <div className="location-list">
            {['ACIJ · Joinville', 'Corporate Park · Florianópolis', 'CDTEC · Joinville'].map((unit) => (
              <span key={unit}><MapPin size={15} /> {unit}</span>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="eyebrow">Seja Nosso Parceiro</span>
          <h2>
            Mais foco nas vendas,<br />
            menos em burocracia.
          </h2>
          <p>Uma assessoria para corretores que precisam de operação, clareza e velocidade para crescer.</p>
          <div className="hero-actions">
            <Link href="/seja-parceiro" className="btn-accent hero-cta">
              Quero ser parceiro <ArrowRight size={16} />
            </Link>
            <a
              href="https://wa.me/554799153897?text=Olá! Tenho interesse em ser parceiro DuoLife."
              target="_blank"
              rel="noopener"
              className="hero-link"
            >
              Falar no WhatsApp <ChevronRight size={16} />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
