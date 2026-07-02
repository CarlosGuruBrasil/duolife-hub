import Image from 'next/image';
import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';

const links = [
  ['Quem Somos', '/quem-somos'],
  ['Soluções', '/solucoes'],
  ['Nossas Unidades', '/unidades'],
  ['Seja Parceiro', '/seja-parceiro'],
  ['Contato', '/contato'],
];

const socials = [
  { label: 'Instagram', href: 'https://www.instagram.com/duolife.hub' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/duolifehub/' },
];

export default function Footer() {
  return (
    <footer className="bg-[#072a33] text-white/70 py-20 border-t border-white/5 relative z-10">
      <div className="w-[min(92%,1800px)] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          
          <div className="md:col-span-5 text-left">
            <Image
              src="/logo-horizontal.png"
              alt="DuoLife Hub de Negócios"
              width={170}
              height={45}
              className="mb-6 h-9 w-auto object-contain filter brightness-0 invert"
            />
            <p className="text-white/60 text-sm leading-relaxed max-w-sm">
              Assessoria estratégica para corretores e consultores em saúde, seguros e benefícios corporativos. Desde 1995 unindo técnica, agilidade e excelência.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {socials.map((social) => (
                <a
                  className="bg-white/5 hover:bg-[#00d4e0]/20 text-white/80 hover:text-[#00d4e0] rounded-full px-5 py-2 text-xs font-black transition-colors border border-white/5"
                  href={social.href}
                  key={social.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 text-left">
            <h4 className="text-white text-xs font-black uppercase tracking-wider mb-6">Empresa</h4>
            <ul className="space-y-3.5 text-sm">
              {links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-[#00d4e0] transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2 text-left">
            <h4 className="text-white text-xs font-black uppercase tracking-wider mb-6">Portal</h4>
            <ul className="space-y-3.5 text-sm">
              <li><Link href="/portal" className="hover:text-[#00d4e0] transition-colors">Área do Parceiro</Link></li>
              <li><Link href="/portal/cotacoes" className="hover:text-[#00d4e0] transition-colors">Cotações</Link></li>
              <li><Link href="/portal/vendas" className="hover:text-[#00d4e0] transition-colors">Vendas</Link></li>
              <li><Link href="/login" className="hover:text-[#00d4e0] transition-colors">Entrar</Link></li>
            </ul>
          </div>

          <div className="md:col-span-3 text-left">
            <h4 className="text-white text-xs font-black uppercase tracking-wider mb-6">Contato</h4>
            <ul className="space-y-4 text-sm">
              <li>
                <a className="flex items-center gap-2.5 hover:text-[#00d4e0] transition-colors" href="tel:+554799648081">
                  <Phone size={14} className="text-[#00d4e0]" /> (47) 99648-6081
                </a>
              </li>
              <li>
                <a className="flex items-center gap-2.5 hover:text-[#00d4e0] transition-colors" href="tel:+554799648081">
                  <Phone size={14} className="text-[#00d4e0]" /> (47) 99648-6081
                </a>
              </li>
              <li>
                <a className="flex items-center gap-2.5 hover:text-[#00d4e0] transition-colors" href="mailto:comercial@duolife.net.br">
                  <Mail size={14} className="text-[#00d4e0]" /> comercial@duolife.net.br
                </a>
              </li>
              <li className="flex items-center gap-2.5 text-[#7fa8b2]">
                <MapPin size={14} /> Joinville e Florianópolis
              </li>
            </ul>
          </div>

        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between text-xs text-white/55 gap-4">
          <span>© {new Date().getFullYear()} DuoLife Hub de Negócios. CNPJ 00.698.913/0001-23.</span>
          <span>Santa Catarina, Brasil.</span>
        </div>
      </div>
    </footer>
  );
}
