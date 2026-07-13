'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { BriefcaseBusiness, Camera, Mail, MessageCircle, Phone, Sparkles } from 'lucide-react';

const contacts = [
  { icon: Phone, label: 'Comercial', value: '(47) 99153-3897', href: 'tel:+5547991533897' },
  { icon: Phone, label: 'Operacional', value: '(47) 99648-6081', href: 'tel:+5547996486081' },
  { icon: Mail, label: 'E-mail Comercial', value: 'comercial@duolife.net.br', href: 'mailto:comercial@duolife.net.br' },
  { icon: Mail, label: 'E-mail Operacional', value: 'operacional@duolife.net.br', href: 'mailto:operacional@duolife.net.br' },
  { icon: Camera, label: 'Instagram', value: '@duolife.hub', href: 'https://www.instagram.com/duolife.hub' },
  { icon: BriefcaseBusiness, label: 'LinkedIn', value: 'Duolife Hub', href: 'https://www.linkedin.com/company/duolifehub/' },
];

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
  style?: any;
}

function Card3D({ children, className = '', style = {} }: Card3DProps) {
  return <div style={style} className={className}>{children}</div>;
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
  }
};

export default function ContatoClient() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('sending');
    const message = `Olá! Me chamo ${form.name}. ${form.message} (${form.email} / ${form.phone})`;
    window.open(`https://wa.me/5547996486081?text=${encodeURIComponent(message)}`, '_blank');
    setStatus('sent');
  }

  return (
    <div className="bg-white text-primary-dark">

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-primary-dark text-white min-h-screen flex items-start">
        <Image src="/duolife-team-meeting.jpg" alt="" fill className="object-cover object-[50%_22%]" priority />
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
              Fale Conosco
            </motion.div>
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="hero-title-wrap text-4xl md:text-6xl lg:text-[76px] xl:text-[84px] font-black tracking-[-0.03em] leading-[1.02] uppercase mb-6 text-gradient-shimmer drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
            >
              Escolha o canal mais <span className="text-accent">direto para falar</span>.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="text-base md:text-lg text-white/84 leading-relaxed font-light mb-10 max-w-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)]"
            >
              Atendimento comercial e operacional ágil de segunda a sexta, das 8h às 18h.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Split de Contato e Canais */}
      <section className="py-28 px-6 bg-white border-b border-border">
        <div className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 items-start">
          
          {/* Lado Esquerdo - Canais */}
          <div className="lg:col-span-6 text-left">
            <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Canais Oficiais</span>
            <h2 className="text-3xl md:text-5xl font-black text-primary uppercase leading-tight mb-6">Prontidão Técnica e Comercial</h2>
            <p className="text-[#4d686f] font-light leading-relaxed text-base mb-8">
              Utilize nossos canais abaixo para falar diretamente com o setor necessário. Oferecemos respostas rápidas no WhatsApp.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {contacts.map((c) => {
                const Icon = c.icon;
                return (
                  <a
                    className="bg-surface border border-border rounded-2xl p-5 hover:border-primary/20 transition-all flex items-center gap-4"
                    href={c.href}
                    key={c.value}
                    rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    target={c.href.startsWith('http') ? '_blank' : undefined}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center shrink-0">
                      <Icon size={18} />
                    </div>
                    <div>
                      <span className="block text-[10px] font-black text-secondary uppercase tracking-wider">{c.label}</span>
                      <strong className="text-sm font-black text-primary tracking-tight">{c.value}</strong>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Lado Direito - Formulário */}
          <div className="lg:col-span-6">
            <Card3D className="bg-white border border-border rounded-[36px] p-8 md:p-10 shadow-2xl relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[radial-gradient(circle,_rgba(0,212,224,0.06)_0%,_transparent_60%)] pointer-events-none" />
              
              <h3 className="text-2xl font-black text-primary uppercase tracking-tight mb-2">Envie uma Mensagem</h3>
              <p className="text-[#4d686f] text-sm font-light mb-8">Preparamos uma mensagem que será aberta automaticamente no seu WhatsApp comercial.</p>

              {status === 'sent' ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-accent/10 text-primary flex items-center justify-center mx-auto mb-6">
                    <MessageCircle size={30} />
                  </div>
                  <p className="font-black text-primary uppercase tracking-wider text-sm">Mensagem Direcionada!</p>
                  <p className="text-[#4d686f] text-xs font-light mt-2">O WhatsApp Web ou App foi aberto no seu dispositivo.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Seu Nome Completo *</label>
                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="João Silva" />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">E-mail Corporativo *</label>
                      <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="seu@email.com" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">WhatsApp / Telefone *</label>
                      <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="(47) 99999-9999" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Mensagem *</label>
                    <textarea required value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" rows={4} placeholder="Como a DuoLife pode ajudar a sua corretora hoje?" />
                  </div>

                  <button type="submit" disabled={status === 'sending'}
                    className="w-full bg-accent hover:bg-[#00b2be] disabled:bg-secondary text-primary-dark py-4.5 rounded-full font-black text-sm uppercase tracking-wider shadow-lg shadow-accent/10 transition-colors flex items-center justify-center gap-2"
                  >
                    {status === 'sending' ? 'Preparando...' : 'Iniciar Conversa no WhatsApp'}
                  </button>
                </form>
              )}
            </Card3D>
          </div>

        </div>
      </section>

    </div>
  );
}
