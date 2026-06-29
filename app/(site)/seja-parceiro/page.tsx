'use client';
import { useState } from 'react';
import { BarChart3, CheckCircle2, Globe2, GraduationCap, Handshake, WalletCards, Zap } from 'lucide-react';

const benefits = [
  { icon: BarChart3, title: 'Dashboard exclusivo', desc: 'Portal com seus leads, cotações e comissões em tempo real.' },
  { icon: Zap, title: 'Cotação rápida', desc: 'Cote e emita o Seguro RC direto pela plataforma.' },
  { icon: GraduationCap, title: 'Capacitação', desc: 'Treinamentos e suporte técnico especializado.' },
  { icon: WalletCards, title: 'Comissões competitivas', desc: 'Remuneração justa e pagamento pontual.' },
  { icon: Handshake, title: 'Suporte dedicado', desc: 'Time comercial e operacional sempre disponível.' },
  { icon: Globe2, title: 'Acesso nacional', desc: 'Relacionamento direto com as principais seguradoras.' },
];

export default function SejaParceiro() {
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full text-center">
          <div className="icon-box mx-auto mb-4"><CheckCircle2 size={30} /></div>
          <h2 className="text-2xl font-black mb-3" style={{ color: 'var(--primary)' }}>Cadastro recebido!</h2>
          <p className="text-gray-600 mb-6">Nossa equipe entrará em contato em até 24 horas úteis para dar início à sua parceria.</p>
          <a href="/" className="btn-primary w-full text-center block">Voltar ao início</a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }} className="text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Faça parte da rede</p>
          <h1 className="text-4xl md:text-5xl font-black mb-6">Seja Nosso Parceiro</h1>
          <p className="text-xl font-semibold mb-4" style={{ color: 'var(--secondary)' }}>
            Mais foco nas Vendas, menos em Burocracia.
          </p>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#d7e6e8' }}>
            Descubra como a Duolife pode acelerar sua performance com parceria de verdade.
          </p>
        </div>
      </section>

      {/* Benefícios */}
      <section className="section">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Vantagens</p>
          <h2 className="text-3xl font-black" style={{ color: 'var(--primary)' }}>O que você ganha sendo parceiro DuoLife</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {benefits.map(b => {
            const Icon = b.icon;
            return (
            <div key={b.title} className="card flex gap-4">
              <div className="icon-box"><Icon size={22} /></div>
              <div>
                <h4 className="font-bold mb-1" style={{ color: 'var(--primary)' }}>{b.title}</h4>
                <p className="text-sm text-gray-500">{b.desc}</p>
              </div>
            </div>
          );
          })}
        </div>

        {/* Formulário */}
        <div className="max-w-2xl mx-auto">
          <div className="card">
            <h3 className="text-2xl font-black mb-2" style={{ color: 'var(--primary)' }}>Cadastre-se agora</h3>
            <p className="text-gray-500 text-sm mb-8">Nossa equipe entrará em contato em até 24 horas úteis.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Seu nome *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="form-input"
                    placeholder="João Silva" />
                </div>
                <div>
                  <label className="field-label">Empresa / Corretora *</label>
                  <input required value={form.company} onChange={e => setForm({ ...form, company: e.target.value })}
                    className="form-input"
                    placeholder="Corretora Silva" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">CNPJ</label>
                  <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })}
                    className="form-input"
                    placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="field-label">E-mail *</label>
                  <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="form-input"
                    placeholder="joao@corretora.com.br" />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Telefone / WhatsApp *</label>
                  <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="form-input"
                    placeholder="(47) 99999-9999" />
                </div>
                <div>
                  <label className="field-label">Cidade</label>
                  <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                    className="form-input"
                    placeholder="Joinville" />
                </div>
                <div>
                  <label className="field-label">Estado</label>
                  <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                    className="form-input"
                    placeholder="SC" maxLength={2} />
                </div>
              </div>
              <div>
                <label className="field-label">Mensagem</label>
                <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                  className="form-input"
                  rows={3} placeholder="Conte um pouco sobre sua atuação atual..." />
              </div>
              {status === 'error' && (
                <p className="text-red-500 text-sm">Erro ao enviar. Tente novamente ou entre em contato pelo WhatsApp.</p>
              )}
              <button type="submit" disabled={status === 'sending'}
                className="btn-primary w-full justify-center text-base py-4">
                {status === 'sending' ? 'Enviando...' : 'Quero ser parceiro DuoLife'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
