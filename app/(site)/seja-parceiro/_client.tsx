'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CheckCircle2,
  Globe2,
  GraduationCap,
  Handshake,
  WalletCards,
  Zap,
  Sparkles,
  ArrowRight
} from 'lucide-react';

const benefits = [
  { icon: BarChart3, title: 'Dashboard exclusivo', desc: 'Portal com seus leads, cotações e comissões corporativas em tempo real.' },
  { icon: Zap, title: 'Cotação rápida', desc: 'Cote e emita seguros como Responsabilidade Civil (RC) direto pela plataforma.' },
  { icon: GraduationCap, title: 'Capacitação Técnica', desc: 'Treinamentos constantes e suporte técnico especializado de produtos.' },
  { icon: WalletCards, title: 'Comissões competitivas', desc: 'Remuneração justa, acompanhamento detalhado e pagamentos pontuais.' },
  { icon: Handshake, title: 'Suporte operacional dedicado', desc: 'Time comercial e de back-office estruturado para te assessorar.' },
  { icon: Globe2, title: 'Parceria nacional', desc: 'Acesso preferencial com as maiores seguradoras e operadoras de saúde do país.' },
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

export default function SejaParceiroClient() {
  const [form, setForm] = useState({
    name: '', company: '', cnpj: '', email: '', phone: '', city: '', state: '', message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/parceiros/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) setStatus('sent');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#f7faf9]">
        <Card3D className="bg-white border border-[#e0eceb] max-w-md w-full p-8 rounded-[36px] shadow-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-[#00d4e0]/10 text-[#0e4a5a] flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-3xl font-black text-[#0e4a5a] uppercase tracking-tight mb-4">Cadastro recebido!</h2>
          <p className="text-[#4d686f] text-sm leading-relaxed mb-8">Nossa equipe comercial analisará suas informações e entrará em contato em até 24 horas úteis para formalizar a sua assessoria.</p>
          <Link href="/" className="btn-primary w-full text-center py-4 bg-[#0e4a5a] hover:bg-[#072a33] text-white rounded-full font-black text-sm uppercase tracking-wider block transition-colors">
            Voltar à Home
          </Link>
        </Card3D>
      </div>
    );
  }

  return (
    <div className="bg-[#ffffff] text-[#072a33]">

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden bg-[#072a33] text-[#ffffff] min-h-screen flex items-start">
        <Image src="/duolife-partners-board.jpg" alt="" fill className="object-cover object-[50%_24%]" priority />
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
              Seja um Parceiro
            </motion.div>
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="hero-title-wrap text-4xl md:text-6xl lg:text-[76px] xl:text-[84px] font-black tracking-[-0.03em] leading-[1.02] uppercase mb-6 text-gradient-shimmer drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
            >
              Mais foco nas Vendas. <span className="text-[#00d4e0]">Menos burocracia</span>.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="text-base md:text-lg text-white/84 leading-relaxed font-light mb-10 max-w-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)]"
            >
              Descubra como a DuoLife pode atuar como sua retaguarda estratégica de cotações, renovações e pós-vendas, otimizando sua produtividade diária.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Seção Grid de Vantagens */}
      <section className="py-28 px-6 bg-white border-b border-[#e0eceb]">
        <div className="w-[min(92%,1800px)] mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-[#0e4a5a] uppercase mb-6 block">Vantagens de Parceria</span>
            <h2 className="text-3xl md:text-5.5xl font-black tracking-tight text-[#0e4a5a] uppercase">O que você ganha conosco</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-20">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <Card3D 
                  key={b.title} 
                  className="bg-[#f7faf9] border border-[#e0eceb] rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow text-left cursor-grab active:cursor-grabbing"
                >
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-[#0e4a5a]/5 text-[#0e4a5a] flex items-center justify-center shrink-0">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-[#0e4a5a] uppercase tracking-tight leading-tight mb-2">{b.title}</h4>
                      <p className="text-xs text-[#4d686f] font-light leading-relaxed">{b.desc}</p>
                    </div>
                  </div>
                </Card3D>
              );
            })}
          </div>

          {/* Formulário de Cadastro */}
          <div className="max-w-3xl mx-auto">
            <Card3D className="bg-white border border-[#e0eceb] rounded-[36px] p-8 md:p-12 shadow-2xl relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[radial-gradient(circle,_rgba(0,212,224,0.06)_0%,_transparent_60%)] pointer-events-none" />
              
              <h3 className="text-2xl md:text-3xl font-black text-[#0e4a5a] uppercase tracking-tight mb-2">Preencha sua solicitação</h3>
              <p className="text-[#4d686f] text-sm font-light mb-8">Nossa equipe comercial analisará suas informações e entrará em contato em menos de 24 horas úteis.</p>
              
              <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">Seu Nome Completo *</label>
                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="Ex: João Silva" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">Empresa / Corretora *</label>
                    <input required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="Ex: Silva Seguros" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">CNPJ da Corretora</label>
                    <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="00.000.000/0001-00" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">E-mail Corporativo *</label>
                    <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="joao@corretora.com.br" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">WhatsApp / Telefone *</label>
                    <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="(47) 99999-9999" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">Cidade</label>
                    <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="Joinville" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">Estado</label>
                    <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                      className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" placeholder="SC" maxLength={2} />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[#0e4a5a] uppercase tracking-wider mb-2">Mensagem Adicional</label>
                  <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full bg-[#f7faf9] border border-[#e0eceb] rounded-xl px-4 py-3.5 text-sm text-[#0e4a5a] placeholder-[#7fa8b2]/70 focus:outline-none focus:border-[#00d4e0] focus:ring-1 focus:ring-[#00d4e0] transition-colors" rows={3} placeholder="Descreva sua carteira ou foco comercial..." />
                </div>

                {status === 'error' && (
                  <p className="text-red-500 text-xs font-semibold">Erro ao enviar dados. Por favor, tente novamente ou entre em contato direto pelo WhatsApp comercial.</p>
                )}

                <button type="submit" disabled={status === 'sending'}
                  className="w-full bg-[#00d4e0] hover:bg-[#00b2be] disabled:bg-[#7fa8b2] text-[#072a33] py-4.5 rounded-full font-black text-sm uppercase tracking-wider shadow-lg shadow-[#00d4e0]/10 transition-colors flex items-center justify-center gap-2"
                >
                  {status === 'sending' ? 'Enviando Dados...' : 'Solicitar Atendimento de Parceria'}
                  <ArrowRight size={16} />
                </button>
              </form>
            </Card3D>
          </div>

        </div>
      </section>

    </div>
  );
}
