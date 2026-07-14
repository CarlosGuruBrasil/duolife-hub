'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import InternalPageHero from '@/components/site/InternalPageHero';
import {
  BarChart3,
  CheckCircle2,
  Globe2,
  GraduationCap,
  Handshake,
  WalletCards,
  Zap,
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
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
        <Card3D className="bg-white border border-border max-w-md w-full p-8 rounded-[36px] shadow-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-accent/10 text-primary flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-3xl font-black text-primary uppercase tracking-tight mb-4">Cadastro recebido!</h2>
          <p className="text-[#4d686f] text-sm leading-relaxed mb-8">Nossa equipe comercial analisará suas informações e entrará em contato em até 24 horas úteis para formalizar a sua assessoria.</p>
          <Link href="/" className="btn-primary w-full text-center py-4 bg-primary hover:bg-primary-dark text-white rounded-full font-black text-sm uppercase tracking-wider block transition-colors">
            Voltar à Home
          </Link>
        </Card3D>
      </div>
    );
  }

  return (
    <div className="bg-white text-primary-dark">

      {/* Hero Section */}
      <InternalPageHero
        badge="Seja um Parceiro"
        imageSrc="/duolife-partners-board.jpg"
        imageClassName="object-cover object-[50%_24%]"
        title={
          <>
            Mais foco nas Vendas. <span className="text-gradient-shimmer font-black">Menos burocracia</span>.
          </>
        }
        description="Descubra como a DuoLife pode atuar como sua retaguarda estratégica de cotações, renovações e pós-vendas, otimizando sua produtividade diária."
      />

      {/* Seção Grid de Vantagens */}
      <section className="py-28 px-6 bg-white border-b border-border">
        <div className="w-[min(92%,1800px)] mx-auto">
          <div className="mb-16 grid gap-6 md:grid-cols-3">
            {[
              { value: '+180', label: 'parceiros ativos na operação' },
              { value: 'B2B', label: 'foco em benefícios e seguros corporativos' },
              { value: 'Apoio', label: 'comercial, técnico e operacional integrado' },
            ].map((item) => (
              <div key={item.label} className="rounded-[28px] border border-border bg-surface p-6 shadow-[0_18px_50px_rgba(14,74,90,0.05)] text-left">
                <div className="text-4xl font-black leading-none tracking-tight text-primary">{item.value}</div>
                <div className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-secondary">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-black tracking-widest text-primary uppercase mb-6 block">Vantagens de Parceria</span>
            <h2 className="text-3xl md:text-[3.5rem] font-black tracking-tight text-primary uppercase">O que você ganha conosco</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-20">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <Card3D 
                  key={b.title} 
                  className="bg-surface border border-border rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow text-left"
                >
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center shrink-0">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-primary uppercase tracking-tight leading-tight mb-2">{b.title}</h4>
                      <p className="text-xs text-[#4d686f] font-light leading-relaxed">{b.desc}</p>
                    </div>
                  </div>
                </Card3D>
              );
            })}
          </div>

          <div className="mb-20 grid gap-6 lg:grid-cols-3">
            {[
              { step: '01', title: 'Envie seu cadastro', desc: 'Compartilhe seus dados e contexto comercial para que a equipe conheça sua operação.' },
              { step: '02', title: 'Receba o contato inicial', desc: 'Nosso time valida aderência, explica o modelo e organiza os próximos passos da parceria.' },
              { step: '03', title: 'Comece com retaguarda real', desc: 'Após alinhamento, você passa a contar com suporte técnico, operacional e comercial.' },
            ].map((item) => (
              <div key={item.step} className="rounded-[28px] border border-border bg-white p-6 shadow-[0_18px_50px_rgba(14,74,90,0.05)] text-left">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-secondary">{item.step}</div>
                <h3 className="mt-4 text-xl font-black uppercase tracking-tight text-primary">{item.title}</h3>
                <p className="mt-3 text-sm font-light leading-relaxed text-[#435a61]">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Formulário de Cadastro */}
          <div className="max-w-3xl mx-auto">
            <Card3D className="bg-white border border-border rounded-[36px] p-8 md:p-12 shadow-2xl relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[radial-gradient(circle,_rgba(0,212,224,0.06)_0%,_transparent_60%)] pointer-events-none" />
              
              <h3 className="text-2xl md:text-3xl font-black text-primary uppercase tracking-tight mb-2">Preencha sua solicitação</h3>
              <p className="text-[#4d686f] text-sm font-light mb-8">Nossa equipe comercial analisará suas informações e entrará em contato em menos de 24 horas úteis.</p>
              <div className="mb-8 flex flex-wrap gap-2.5">
                {['Onboarding comercial', 'Análise de aderência', 'Contato em até 24h úteis', 'Modelo B2B'].map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                    {tag}
                  </span>
                ))}
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-7 relative z-10">
                <div className="rounded-[28px] border border-border bg-surface/80 p-5">
                  <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Identificação principal</div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Seu Nome Completo *</label>
                      <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="Ex: João Silva" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Empresa / Corretora *</label>
                      <input required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="Ex: Silva Seguros" />
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border bg-white p-5">
                  <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Dados da operação</div>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">CNPJ da Corretora</label>
                      <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="00.000.000/0001-00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">E-mail Corporativo *</label>
                      <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="joao@corretora.com.br" />
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border bg-surface/80 p-5">
                  <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Localização e contato</div>
                  <div className="grid sm:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">WhatsApp / Telefone *</label>
                      <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        className="w-full bg-white border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="(47) 99999-9999" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Cidade</label>
                      <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                        className="w-full bg-white border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="Joinville" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Estado</label>
                      <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                        className="w-full bg-white border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" placeholder="SC" maxLength={2} />
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border bg-white p-5">
                  <div className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-secondary">Contexto comercial</div>
                  <div className="grid sm:grid-cols-2 gap-3 mb-5">
                    {['Benefícios corporativos', 'Saúde suplementar', 'Seguros corporativos', 'Expansão de carteira'].map((item) => (
                      <div key={item} className="rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-bold text-primary">
                        {item}
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-primary uppercase tracking-wider mb-2">Mensagem Adicional</label>
                    <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3.5 text-sm text-primary placeholder-secondary/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors" rows={3} placeholder="Descreva sua carteira, foco comercial ou o tipo de apoio que espera da DuoLife..." />
                  </div>
                </div>

                {status === 'error' && (
                  <p className="text-red-500 text-xs font-semibold">Erro ao enviar dados. Por favor, tente novamente ou entre em contato direto pelo WhatsApp comercial.</p>
                )}

                <button type="submit" disabled={status === 'sending'}
                  className="w-full bg-accent hover:bg-[#00b2be] disabled:bg-secondary text-primary-dark py-4.5 rounded-full font-black text-sm uppercase tracking-wider shadow-lg shadow-accent/10 transition-colors flex items-center justify-center gap-2"
                >
                  {status === 'sending' ? 'Enviando Dados...' : 'Solicitar Atendimento de Parceria'}
                  <ArrowRight size={16} />
                </button>
                <p className="text-center text-xs font-light leading-relaxed text-[#667f86]">
                  Esse envio inicia a análise comercial da parceria e nos ajuda a preparar um primeiro contato mais assertivo.
                </p>
              </form>
            </Card3D>
          </div>

        </div>
      </section>

    </div>
  );
}
