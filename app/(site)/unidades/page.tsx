import { Building2, FlaskConical, Waves } from 'lucide-react';

const units = [
  {
    name: 'ACIJ — Associação Empresarial de Joinville',
    address: 'Av. Aluísio Pires Condeixa, 2550 — Sala 29',
    neighborhood: 'Saguaçu',
    city: 'Joinville — SC',
    cep: '89221-750',
    maps: 'https://maps.google.com/?q=Av.+Aluísio+Pires+Condeixa,+2550,+Joinville,+SC',
    icon: Building2,
  },
  {
    name: 'Centro Empresarial Corporate Park',
    address: 'Rod. José Carlos Daux, 8600 — Bloco 3, Sala 3',
    neighborhood: 'Santo Antônio de Lisboa',
    city: 'Florianópolis — SC',
    cep: '88050-000',
    maps: 'https://maps.google.com/?q=Rod.+José+Carlos+Daux,+8600,+Florianópolis,+SC',
    icon: Waves,
  },
  {
    name: 'CDTEC — Condomínio de Desenvolvimento Tecnológico',
    address: 'Rua São Paulo, 31 — Sala 06',
    neighborhood: 'Centro',
    city: 'Joinville — SC',
    cep: '89202-200',
    maps: 'https://maps.google.com/?q=Rua+São+Paulo,+31,+Joinville,+SC',
    icon: FlaskConical,
  },
];

export default function Unidades() {
  return (
    <div>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%)' }} className="text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Onde estamos</p>
          <h1 className="text-4xl md:text-5xl font-black mb-6">Nossas Unidades</h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#d7e6e8' }}>
            Presença em <strong className="text-white">Joinville e Florianópolis</strong>, com atuação em todo o Brasil — foco especial na Região Sul.
          </p>
        </div>
      </section>

      {/* Unidades */}
      <section className="section">
        <div className="grid md:grid-cols-3 gap-8">
          {units.map(u => {
            const Icon = u.icon;
            return (
            <div key={u.name} className="card flex flex-col">
              <div className="icon-box mb-4"><Icon size={23} /></div>
              <h3 className="font-bold text-lg mb-3 leading-tight" style={{ color: 'var(--primary)' }}>{u.name}</h3>
              <div className="flex-1 text-sm text-gray-600 space-y-1 mb-6">
                <p>{u.address}</p>
                <p>{u.neighborhood}</p>
                <p className="font-medium">{u.city}</p>
                <p style={{ color: 'var(--text-light)' }}>CEP {u.cep}</p>
              </div>
              <a href={u.maps} target="_blank" rel="noopener"
                className="map-link text-center py-2 px-4 rounded-lg text-sm font-semibold transition-all">
                Ver no Google Maps
              </a>
            </div>
          );
          })}
        </div>
      </section>

      {/* Cobertura nacional */}
      <section className="py-16 px-4 text-center" style={{ background: 'var(--accent-soft)' }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--secondary)' }}>Abrangência</p>
          <h2 className="text-3xl font-black mb-4" style={{ color: 'var(--primary)' }}>Atendemos todo o Brasil</h2>
          <p className="text-gray-600 leading-relaxed mb-6">
            Com sede em Joinville e unidade em Florianópolis, a DuoLife tem <strong>Atuação Comercial em todo território nacional</strong> e relacionamento direto com Operadoras e Seguradoras em diversas regiões.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            {['Santa Catarina', 'Paraná', 'Rio Grande do Sul', 'São Paulo', 'Rio de Janeiro', 'Todo o Brasil'].map(r => (
              <span key={r} className="px-4 py-2 rounded-full text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
