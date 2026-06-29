import Link from 'next/link';
import Image from 'next/image';
import { Phone, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer style={{ background: '#f5f5f7', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">

          {/* Marca */}
          <div className="md:col-span-2">
            <Image src="/logo-horizontal.png" alt="DuoLife Hub de Negócios"
              width={160} height={42} className="h-9 w-auto object-contain mb-5" />
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--text-secondary)' }}>
              Parceira de Excelência em Benefícios Corporativos. Há quase uma década impulsionando Corretores e Consultores na jornada de vendas.
            </p>
            <div className="flex gap-3 mt-5">
              {[
                { href: 'https://www.instagram.com/duolife.hub', label: 'Instagram' },
                { href: 'https://www.linkedin.com/company/duolifehub/', label: 'LinkedIn' },
              ].map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener"
                  className="footer-social-link text-xs font-semibold px-4 py-2 rounded-full transition-all">
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--text-light)' }}>
              Empresa
            </h4>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {[['Quem Somos', '/quem-somos'], ['Soluções', '/solucoes'],
                ['Nossas Unidades', '/unidades'], ['Seja Parceiro', '/seja-parceiro'],
                ['Contato', '/contato']].map(([l, h]) => (
                <li key={h}>
                  <Link href={h} className="transition-colors hover:text-black" style={{ color: 'inherit' }}>{l}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--text-light)' }}>
              Contato
            </h4>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li>
                <a href="tel:+554799153897" className="flex items-center gap-2 transition-colors hover:text-black">
                  <Phone size={13} /> (47) 99153-3897
                </a>
              </li>
              <li>
                <a href="tel:+554799648081" className="flex items-center gap-2 transition-colors hover:text-black">
                  <Phone size={13} /> (47) 99648-6081
                </a>
              </li>
              <li>
                <a href="mailto:comercial@duolife.net.br" className="flex items-center gap-2 transition-colors hover:text-black">
                  <Mail size={13} /> comercial@duolife.net.br
                </a>
              </li>
            </ul>
            <Link href="/portal"
              className="footer-portal-link mt-5 inline-block text-sm font-semibold px-4 py-2 rounded-full transition-all">
              Portal do Parceiro →
            </Link>
          </div>
        </div>

        <div className="mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-2 text-xs"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-light)' }}>
          <span>© {new Date().getFullYear()} DuoLife Hub de Negócios — CNPJ 00.698.913/0001-23</span>
          <span>Joinville & Florianópolis, SC — Brasil</span>
        </div>
      </div>
    </footer>
  );
}
