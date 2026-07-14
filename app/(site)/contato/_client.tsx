'use client';

import React, { useState } from 'react';
import { BriefcaseBusiness, Camera, Mail, MessageCircle, Phone } from 'lucide-react';
import InternalPageHero from '@/components/site/InternalPageHero';

const contacts = [
  { icon: Phone, label: 'Telefone', value: '(47) 99648-6081', href: 'tel:+5547996486081' },
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
      <InternalPageHero
        badge="Fale Conosco"
        imageSrc="/duolife-team-meeting.jpg"
        imageClassName="object-cover object-[50%_22%]"
        title={
          <>
            Escolha o canal mais <span className="text-gradient-shimmer font-black">direto para falar</span>.
          </>
        }
        description="Atendimento comercial e operacional ágil de segunda a sexta, das 8h às 18h."
      />

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

            <div className="grid gap-4 sm:grid-cols-2 mb-8">
              <div className="rounded-[28px] border border-border bg-surface p-6 shadow-[0_18px_50px_rgba(14,74,90,0.05)]">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Resposta Comercial</div>
                <div className="mt-3 text-3xl font-black leading-none tracking-tight text-primary">Ágil</div>
                <p className="mt-3 text-sm font-light leading-relaxed text-[#435a61]">
                  Conversas direcionadas para oportunidades, onboarding de parceiros e alinhamentos de carteira.
                </p>
              </div>
              <div className="rounded-[28px] border border-border bg-white p-6 shadow-[0_18px_50px_rgba(14,74,90,0.05)]">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Suporte Operacional</div>
                <div className="mt-3 text-3xl font-black leading-none tracking-tight text-primary">Direto</div>
                <p className="mt-3 text-sm font-light leading-relaxed text-[#435a61]">
                  Canal preparado para demandas do dia a dia com acompanhamento próximo e resposta objetiva.
                </p>
              </div>
            </div>

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
                    <div className="min-w-0">
                      <span className="block text-[10px] font-black text-secondary uppercase tracking-wider">{c.label}</span>
                      <strong className="block text-sm font-black text-primary tracking-tight break-words">{c.value}</strong>
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
              <div className="mb-8 flex flex-wrap gap-2.5">
                {['Comercial', 'Operacional', 'Parcerias', 'Suporte diário'].map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                    {tag}
                  </span>
                ))}
              </div>

              {status === 'sent' ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-accent/10 text-primary flex items-center justify-center mx-auto mb-6">
                    <MessageCircle size={30} />
                  </div>
                  <p className="font-black text-primary uppercase tracking-wider text-sm">Mensagem Direcionada!</p>
                  <p className="text-[#4d686f] text-xs font-light mt-2">O WhatsApp Web ou App foi aberto no seu dispositivo.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-7 relative z-10">
                  <div className="rounded-[28px] border border-border bg-surface/80 p-5">
                    <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Quem está entrando em contato</div>
                    <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Seu Nome Completo *</label>
                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="João Silva" />
                  </div>

                  <div className="rounded-[28px] border border-border bg-white p-5">
                    <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Como podemos responder</div>
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
                  </div>

                  <div className="rounded-[28px] border border-border bg-surface/80 p-5">
                    <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Sua necessidade</div>
                    <div className="grid sm:grid-cols-2 gap-3 mb-5">
                      {['Quero falar com o comercial', 'Preciso de suporte operacional', 'Tenho interesse em parceria', 'Quero entender os serviços'].map((item) => (
                        <div key={item} className="rounded-2xl border border-border bg-white px-4 py-3 text-xs font-bold text-primary">
                          {item}
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Mensagem *</label>
                      <textarea required value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                        className="w-full bg-white border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" rows={4} placeholder="Como a DuoLife pode ajudar a sua corretora hoje?" />
                    </div>
                  </div>

                  <button type="submit" disabled={status === 'sending'}
                    className="w-full bg-accent hover:bg-[#00b2be] disabled:bg-secondary text-primary-dark py-4.5 rounded-full font-black text-sm uppercase tracking-wider shadow-lg shadow-accent/10 transition-colors flex items-center justify-center gap-2"
                  >
                    {status === 'sending' ? 'Preparando...' : 'Iniciar Conversa no WhatsApp'}
                  </button>
                  <p className="text-center text-xs font-light leading-relaxed text-[#667f86]">
                    Ao clicar, abrimos a conversa com a mensagem pronta para agilizar o seu atendimento.
                  </p>
                </form>
              )}
            </Card3D>
          </div>

        </div>
      </section>

    </div>
  );
}
