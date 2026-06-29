'use client';
import { useState } from 'react';
import { BriefcaseBusiness, Camera, Mail, MessageCircle, Phone } from 'lucide-react';

const contacts = [
  { icon: Phone, label: 'Comercial', value: '(47) 99153-3897', href: 'tel:+554799153897' },
  { icon: Phone, label: 'Operacional', value: '(47) 99648-6081', href: 'tel:+554799648081' },
  { icon: Mail, label: 'E-mail Comercial', value: 'comercial@duolife.net.br', href: 'mailto:comercial@duolife.net.br' },
  { icon: Mail, label: 'E-mail Operacional', value: 'operacional@duolife.net.br', href: 'mailto:operacional@duolife.net.br' },
  { icon: Camera, label: 'Instagram', value: '@duolife.hub', href: 'https://www.instagram.com/duolife.hub' },
  { icon: BriefcaseBusiness, label: 'LinkedIn', value: 'Duolife Hub', href: 'https://www.linkedin.com/company/duolifehub/' },
];

export default function Contato() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    // ponytail: formulário simples, sem backend específico por agora — redireciona para WhatsApp
    const msg = `Olá! Me chamo ${form.name}. ${form.message} (${form.email} / ${form.phone})`;
    window.open(`https://wa.me/554799153897?text=${encodeURIComponent(msg)}`, '_blank');
    setStatus('sent');
  }

  return (
    <div>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }} className="text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Fale conosco</p>
          <h1 className="text-4xl md:text-5xl font-black mb-6">Contato</h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#d7e6e8' }}>
            Estamos prontos para atender você. Escolha o canal mais conveniente.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="grid md:grid-cols-2 gap-12">
          {/* Informações de contato */}
          <div>
            <h2 className="text-2xl font-black mb-8" style={{ color: 'var(--primary)' }}>Nossos canais</h2>
            <div className="space-y-4">
              {contacts.map(c => {
                const Icon = c.icon;
                return (
                <a key={c.value} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener"
                  className="flex items-center gap-4 card hover:border-[var(--secondary)] transition-colors">
                  <div className="icon-box"><Icon size={21} /></div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>{c.label}</div>
                    <div className="font-semibold" style={{ color: 'var(--primary)' }}>{c.value}</div>
                  </div>
                </a>
              );
              })}
            </div>

            <div className="mt-8 card" style={{ borderLeft: '4px solid var(--secondary)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--primary)' }}>Horário de atendimento</p>
              <p className="text-sm text-gray-600">Segunda a Sexta: 8h às 18h</p>
              <p className="text-sm text-gray-600">WhatsApp: resposta em até 2 horas úteis</p>
            </div>
          </div>

          {/* Formulário */}
          <div className="card">
            <h3 className="text-xl font-black mb-6" style={{ color: 'var(--primary)' }}>Envie sua mensagem</h3>
            {status === 'sent' ? (
              <div className="text-center py-8">
                <div className="icon-box mx-auto mb-4"><MessageCircle size={28} /></div>
                <p className="font-semibold" style={{ color: 'var(--primary)' }}>Abrindo WhatsApp...</p>
                <p className="text-sm text-gray-500 mt-2">Sua mensagem foi preparada para envio pelo WhatsApp.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="field-label">Nome *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="form-input"
                    placeholder="Seu nome completo" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">E-mail *</label>
                    <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      className="form-input"
                      placeholder="seu@email.com" />
                  </div>
                  <div>
                    <label className="field-label">Telefone</label>
                    <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="form-input"
                      placeholder="(47) 99999-9999" />
                  </div>
                </div>
                <div>
                  <label className="field-label">Mensagem *</label>
                  <textarea required value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                    className="form-input"
                    rows={4} placeholder="Como podemos ajudar?" />
                </div>
                <button type="submit" disabled={status === 'sending'} className="btn-primary w-full justify-center py-4">
                  {status === 'sending' ? 'Preparando...' : 'Enviar pelo WhatsApp'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
