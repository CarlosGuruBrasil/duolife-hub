'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  ClipboardList, 
  ShieldCheck, 
  Headphones, 
  Globe, 
  MapPin, 
  ArrowRight,
  Sparkles,
  Phone,
  Check,
  Star,
  Users,
  ChevronDown,
  Clock,
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronRight,
  Target
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1
    }
  }
};

export default function DuoLifeJetonStylePage() {
  // Estados para o Simulador de Produtividade do Corretor
  const [vidas, setVidas] = useState<number>(350);
  const [horasOperacionais, setHorasOperacionais] = useState<number>(12);
  const [showVidasDropdown, setShowVidasDropdown] = useState(false);

  // Cálculos dinâmicos
  const horasEconomizadas = Math.round(horasOperacionais * 0.75); // 75% poupado
  const novasVendasEstimadas = Math.round((vidas * 0.08) + (horasEconomizadas * 1.8)); 
  const aumentoProdutividade = Math.round((horasEconomizadas / 40) * 100);

  const testimonials = [
    {
      id: 1,
      name: 'Consultare',
      role: 'Corretora de Benefícios',
      rating: 5,
      comment: 'A DuoLife se tornou uma extensão da nossa corretora, atuando de forma estratégica no processo de venda e em situações complexas de pós-venda.',
      initials: 'C'
    },
    {
      id: 2,
      name: 'Investseguros',
      role: 'Assessoria de Seguros',
      rating: 5,
      comment: 'Melhor decisão que tomamos foi poder contar com a assessoria operacional e comercial deles. Equipe extremamente técnica e rápida.',
      initials: 'I'
    },
    {
      id: 3,
      name: 'Silxan Corretora',
      role: 'Corretor Independente',
      rating: 5,
      comment: 'Sempre demonstram proatividade, empatia e total comprometimento em buscar soluções junto às seguradoras. Parceria indispensável.',
      initials: 'S'
    }
  ];

  return (
    <div className="min-h-screen bg-[#F7FAF9] text-[#162321] antialiased selection:bg-[#407870]/10 selection:text-[#407870] relative overflow-hidden">
      
      {/* Decorative Radial Background (Mesh Gradient Effect) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full w-[min(92%,1800px)] h-[600px] bg-[radial-gradient(circle_at_top,_rgba(64,120,112,0.08)_0%,_transparent_65%)] pointer-events-none -z-10" />
      <div className="absolute top-[800px] right-0 w-96 h-96 bg-[#80a8b0]/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[1800px] left-0 w-[500px] h-[500px] bg-[#407870]/3 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-[#edf4f2]/80">
        <div className="w-[min(92%,1800px)] mx-auto px-6 h-20 flex items-center justify-between">
          
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-[#407870] flex items-center justify-center text-white font-black text-xl shadow-sm hover:rotate-6 transition-transform duration-300">
              D
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-[#162321] leading-none">DuoLife</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#526762] mt-0.5">Hub de Negócios</span>
            </div>
          </motion.div>

          <nav className="hidden md:flex items-center gap-8">
            {['Quem Somos', 'Soluções', 'Unidades'].map((link, i) => (
              <motion.div
                key={link}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <Link 
                  href={`/${link.toLowerCase().replace(' ', '-')}`} 
                  className="text-sm font-bold text-[#526762] hover:text-[#407870] transition-colors duration-200"
                >
                  {link}
                </Link>
              </motion.div>
            ))}
          </nav>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="hidden md:flex items-center gap-6"
          >
            <a 
              href="https://wa.me/554799153897?text=Olá! Tenho interesse em ser parceiro DuoLife."
              target="_blank"
              rel="noopener"
              className="text-sm font-bold text-[#526762] hover:text-[#407870] transition-colors duration-200 flex items-center gap-1.5"
            >
              Falar no WhatsApp
            </a>
            <Link 
              href="/seja-parceiro"
              className="bg-[#407870] hover:bg-[#34625b] text-white px-6 py-3 rounded-full text-sm font-bold shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
            >
              Seja Parceiro
            </Link>
          </motion.div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-16 pb-24 lg:pt-24 lg:pb-36 px-6">
        <div className="w-[min(92%,1800px)] mx-auto grid lg:grid-cols-12 gap-16 lg:gap-8 items-center">
          
          {/* Hero Content */}
          <div className="lg:col-span-7 flex flex-col text-center lg:text-left">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2 self-center lg:self-start bg-[#407870]/8 text-[#407870] px-4.5 py-2 rounded-full text-xs font-extrabold tracking-wider uppercase mb-8 border border-[#407870]/10"
            >
              <Sparkles size={14} className="text-[#407870]" />
              Assessoria Premium para Corretores de Seguros e Saúde
            </motion.div>
            
            <motion.h1 
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="text-5xl md:text-7.5xl font-black tracking-tight leading-[1.15] text-[#162321]"
            >
              Venda mais. <br />Opere com <span className="text-[#407870] relative">menos atrito<span className="absolute left-0 bottom-1.5 w-full h-[6px] bg-[#407870]/10 rounded-full" /></span>.
            </motion.h1>
            
            <motion.p 
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] } }
              }}
              className="mt-8 text-lg md:text-xl text-[#526762] max-w-xl mx-auto lg:mx-0 leading-relaxed font-light"
            >
              A DuoLife atua como a sua retaguarda operacional, técnica e comercial. Nós cuidamos do back-office e do pós-venda para você focar no que faz de melhor: vender.
            </motion.p>

            {/* CTAs */}
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] } }
              }}
              className="mt-12 flex flex-wrap gap-4 justify-center lg:justify-start"
            >
              <Link 
                href="/seja-parceiro" 
                className="flex items-center gap-3 bg-[#407870] hover:bg-[#34625b] text-white px-8 py-4.5 rounded-2xl font-black transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-[#407870]/10 transform hover:-translate-y-1"
              >
                Quero ser parceiro
                <ArrowRight size={18} />
              </Link>
              <a 
                href="https://wa.me/554799153897?text=Olá! Tenho interesse em ser parceiro DuoLife."
                target="_blank"
                rel="noopener"
                className="flex items-center gap-3 bg-white border border-[#d7e3df] text-[#162321] hover:border-[#407870]/30 hover:bg-[#F9FAFB] px-8 py-4.5 rounded-2xl font-bold transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-1"
              >
                <Phone size={16} className="text-[#407870]" />
                Falar no WhatsApp
              </a>
            </motion.div>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="mt-12 pt-8 border-t border-[#edf4f2] grid grid-cols-3 gap-6 max-w-md mx-auto lg:mx-0"
            >
              <div>
                <p className="text-2xl font-black text-[#162321]">+180</p>
                <p className="text-xs text-[#82918e] mt-1">Parceiros ativos</p>
              </div>
              <div>
                <p className="text-2xl font-black text-[#162321]">3</p>
                <p className="text-xs text-[#82918e] mt-1">Sedes físicas (SC)</p>
              </div>
              <div>
                <p className="text-2xl font-black text-[#162321]">98.7%</p>
                <p className="text-xs text-[#82918e] mt-1">Taxa de retenção</p>
              </div>
            </motion.div>
          </div>

          {/* SIMULADOR DE PRODUTIVIDADE PREMIUM (Efeito Interativo Jeton) */}
          <div className="lg:col-span-5 flex justify-center">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-[440px] bg-white/80 backdrop-blur-2xl border border-white/50 rounded-[32px] p-8 shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-black text-xl text-[#162321] flex items-center gap-2">
                    <TrendingUp size={20} className="text-[#407870]" />
                    Calculadora de Escala
                  </h3>
                  <p className="text-xs text-[#82918e] mt-1">Simule o impacto da assessoria</p>
                </div>
                <span className="text-[10px] uppercase bg-[#407870]/10 px-3 py-1 rounded-full text-[#407870] font-black tracking-wider">
                  Real
                </span>
              </div>

              {/* Vidas na Carteira Input */}
              <div className="bg-[#F7FAF9] rounded-2xl p-5 border border-[#edf4f2] relative mb-4 hover:border-[#407870]/20 transition-colors duration-300">
                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#82918e] mb-2">Vidas sob gestão</label>
                <div className="flex items-center justify-between gap-4">
                  <input 
                    type="number" 
                    value={vidas} 
                    onChange={(e) => setVidas(Math.max(0, Number(e.target.value)))}
                    className="bg-transparent text-2xl font-black text-[#162321] focus:outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  
                  {/* Custom Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => setShowVidasDropdown(!showVidasDropdown)}
                      className="flex items-center gap-2 bg-white border border-[#d7e3df] px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-[#F9FAFB] transition-all"
                    >
                      <span>👥 Carteira</span>
                      <ChevronDown size={12} className="text-[#82918e]" />
                    </button>

                    <AnimatePresence>
                      {showVidasDropdown && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 mt-2 w-36 bg-white border border-[#d7e3df] rounded-2xl shadow-xl z-20 py-2"
                        >
                          {[150, 300, 500, 1000].map((v) => (
                            <button
                              key={v}
                              onClick={() => {
                                setVidas(v);
                                setShowVidasDropdown(false);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-[#F7FAF9] text-xs font-bold transition-colors"
                            >
                              {v} Vidas
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Slider for Hours */}
              <div className="bg-[#F7FAF9] rounded-2xl p-5 border border-[#edf4f2] relative mb-6 hover:border-[#407870]/20 transition-colors duration-300">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#82918e]">Tempo gasto em burocracia</label>
                  <span className="text-sm font-black text-[#407870]">{horasOperacionais}h / sem</span>
                </div>
                <input 
                  type="range" 
                  min="2" 
                  max="40" 
                  value={horasOperacionais}
                  onChange={(e) => setHorasOperacionais(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#d7e3df] rounded-lg appearance-none cursor-pointer accent-[#407870] mt-3"
                />
                <div className="flex justify-between text-[10px] text-[#82918e] font-semibold mt-1.5">
                  <span>Pouco (2h)</span>
                  <span>Muito (40h)</span>
                </div>
              </div>

              {/* Dynamic Outputs (Animated) */}
              <div className="space-y-4 mb-8 border-t border-[#edf4f2]/80 pt-6">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#526762]">Tempo Economizado</span>
                  <motion.span 
                    key={horasEconomizadas}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-xs font-extrabold text-[#407870] bg-[#407870]/8 px-3 py-1.5 rounded-full border border-[#407870]/10"
                  >
                    +{horasEconomizadas} horas por semana
                  </motion.span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#526762]">Produtividade do Time</span>
                  <motion.span 
                    key={aumentoProdutividade}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-xs font-extrabold text-[#162321]"
                  >
                    +{aumentoProdutividade}% mais rápido
                  </motion.span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#526762]">Potencial de Novos Clientes</span>
                  <motion.span 
                    key={novasVendasEstimadas}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-xs font-extrabold text-white bg-[#407870] px-3.5 py-1.5 rounded-full shadow-sm"
                  >
                    +{novasVendasEstimadas} novos contratos/ano
                  </motion.span>
                </div>
              </div>

              <Link 
                href="/seja-parceiro" 
                className="w-full bg-[#162321] hover:bg-[#407870] text-white py-4.5 rounded-2xl font-black transition-all duration-300 flex items-center justify-center gap-2 group shadow-lg hover:shadow-xl text-center"
              >
                Ativar Minha Parceria
                <ArrowRight size={16} className="transform group-hover:translate-x-1.5 transition-transform duration-300" />
              </Link>

            </motion.div>
          </div>

        </div>
      </section>

      {/* BENTO GRID COM WIDGETS INTERATIVOS (A Copia dos Efeitos Jeton) */}
      <section id="features" className="py-28 px-6 bg-white border-t border-[#edf4f2] relative">
        <div className="w-[min(92%,1800px)] mx-auto">
          
          <div className="text-center max-w-3xl mx-auto mb-24">
            <motion.span 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-xs font-extrabold tracking-wider text-[#407870] uppercase"
            >
              Nossos Pilares
            </motion.span>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-4xl md:text-5.5xl font-black tracking-tight mt-3 text-[#162321]"
            >
              Uma estrutura de suporte completa para a sua corretora.
            </motion.h2>
          </div>

          {/* Bento Grid */}
          <motion.div 
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid md:grid-cols-3 gap-8"
          >
            
            {/* Card 1: Comercial (Com Widget Grafico Interno) */}
            <motion.div 
              variants={fadeUp}
              whileHover={{ y: -6, scale: 1.015, boxShadow: '0 25px 50px -12px rgba(64,120,112,0.15)' }}
              className="bg-[#F7FAF9] rounded-[32px] p-8 border border-[#d7e3df]/60 transition-all duration-300 flex flex-col justify-between group h-[380px] overflow-hidden relative"
            >
              <div>
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-[#edf4f2] text-[#407870] group-hover:bg-[#407870] group-hover:text-white transition-all duration-300">
                  <BarChart3 size={22} strokeWidth={1.5} />
                </div>
                <h3 className="font-black text-xl mt-6 text-[#162321]">Apoio Comercial</h3>
                <p className="text-sm text-[#526762] mt-2 font-light leading-relaxed">
                  Auxílio estratégico em negociações complexas, mapeamento de contas e estruturação de abordagens focadas em conversão.
                </p>
              </div>
              
              {/* Mini Widget Grafico (Efeito Jeton) */}
              <div className="my-2 bg-white rounded-xl p-3.5 border border-[#edf4f2] flex items-center justify-between gap-4 shadow-sm group-hover:shadow transition-shadow">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#48BB78]/10 flex items-center justify-center text-[#48BB78]">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <span className="block text-[10px] text-[#82918e] font-bold">Meta Comercial</span>
                    <span className="text-xs font-black text-[#162321]">Corretores DuoLife</span>
                  </div>
                </div>
                <div className="flex gap-1 items-end h-8">
                  <div className="w-1.5 h-3 bg-[#407870]/20 rounded-full" />
                  <div className="w-1.5 h-5 bg-[#407870]/40 rounded-full" />
                  <div className="w-1.5 h-6 bg-[#407870]/60 rounded-full" />
                  <div className="w-1.5 h-8 bg-[#407870] rounded-full group-hover:animate-pulse" />
                </div>
              </div>
            </motion.div>

            {/* Card 2: Tecnico (Com Widget Planos Interno) */}
            <motion.div 
              variants={fadeUp}
              whileHover={{ y: -6, scale: 1.015, boxShadow: '0 25px 50px -12px rgba(64,120,112,0.15)' }}
              className="bg-[#F7FAF9] rounded-[32px] p-8 border border-[#d7e3df]/60 transition-all duration-300 flex flex-col justify-between group h-[380px] overflow-hidden relative"
            >
              <div>
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-[#edf4f2] text-[#407870] group-hover:bg-[#407870] group-hover:text-white transition-all duration-300">
                  <ClipboardList size={22} strokeWidth={1.5} />
                </div>
                <h3 className="font-black text-xl mt-6 text-[#162321]">Suporte Técnico</h3>
                <p className="text-sm text-[#526762] mt-2 font-light leading-relaxed">
                  Estudos de rede credenciada de planos de saúde, análises comparativas de coparticipação e relatórios técnicos aprofundados.
                </p>
              </div>

              {/* Mini Widget Estudo Técnico (Efeito Jeton) */}
              <div className="my-2 bg-white rounded-xl p-3.5 border border-[#edf4f2] flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between text-[9px] font-bold text-[#82918e] border-b border-[#edf4f2] pb-1.5">
                  <span>PRODUTO</span>
                  <span>REDE / PREÇO</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-[#162321]">Plano Master Plus</span>
                  <span className="font-black text-[#407870]">Recomendado</span>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Operacional (Com Widget Pipeline Interno) */}
            <motion.div 
              variants={fadeUp}
              whileHover={{ y: -6, scale: 1.015, boxShadow: '0 25px 50px -12px rgba(64,120,112,0.15)' }}
              className="bg-[#F7FAF9] rounded-[32px] p-8 border border-[#d7e3df]/60 transition-all duration-300 flex flex-col justify-between group h-[380px] overflow-hidden relative"
            >
              <div>
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-[#edf4f2] text-[#407870] group-hover:bg-[#407870] group-hover:text-white transition-all duration-300">
                  <ShieldCheck size={22} strokeWidth={1.5} />
                </div>
                <h3 className="font-black text-xl mt-6 text-[#162321]">Eficiência Operacional</h3>
                <p className="text-sm text-[#526762] mt-2 font-light leading-relaxed">
                  Tratamos da documentação cadastral, envio seguro para operadoras e acompanhamento rigoroso do processo até a emissão do contrato.
                </p>
              </div>

              {/* Mini Widget Pipeline (Efeito Jeton) */}
              <div className="my-2 bg-white rounded-xl p-3 border border-[#edf4f2] flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[#407870]" />
                  <span className="text-[10px] font-extrabold text-[#162321]">Emissão Segura</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#48BB78] animate-pulse" />
                  <span className="text-[9px] font-bold text-[#48BB78]">Concluído</span>
                </div>
              </div>
            </motion.div>

          </motion.div>

          {/* Bento Sub-grid (2 Colunas com Layout Assimétrico) */}
          <div className="grid md:grid-cols-5 gap-8 mt-8">
            
            {/* Card 4 (Pós-Venda - Grande) */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -6, scale: 1.01, boxShadow: '0 25px 50px -12px rgba(64,120,112,0.15)' }}
              className="md:col-span-3 bg-[#F7FAF9] rounded-[32px] p-8 border border-[#d7e3df]/60 transition-all duration-300 flex flex-col justify-between group min-h-[300px]"
            >
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-[#edf4f2] shrink-0 text-[#407870] group-hover:bg-[#407870] group-hover:text-white transition-all duration-300">
                  <Headphones size={22} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-[#162321]">Retenção & Pós-Venda</h3>
                  <p className="text-sm text-[#526762] mt-2 font-light leading-relaxed">
                    Atendimento pós-emissão junto às seguradoras. Cuidamos do acompanhamento de faturamento, alterações contratuais e suporte na manutenção de clientes, reduzindo cancelamentos e garantindo a recorrência do corretor.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-8 flex-wrap">
                {['Atendimento Rápido', 'Resolução de Conflitos', 'Foco em Recorrência'].map((badge) => (
                  <span key={badge} className="bg-white px-4 py-2 rounded-full border border-[#edf4f2] text-xs font-bold text-[#526762]">
                    ✓ {badge}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* Card 5 (Abrangencia - Com Visual Mapa) */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              whileHover={{ y: -6, scale: 1.01, boxShadow: '0 25px 50px -12px rgba(64,120,112,0.15)' }}
              className="md:col-span-2 bg-[#F7FAF9] rounded-[32px] p-8 border border-[#d7e3df]/60 transition-all duration-300 flex flex-col justify-between group min-h-[300px]"
            >
              <div>
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-[#edf4f2] text-[#407870] group-hover:bg-[#407870] group-hover:text-white transition-all duration-300">
                  <Globe size={22} strokeWidth={1.5} />
                </div>
                <h3 className="font-black text-xl mt-6 text-[#162321]">Atuação Nacional</h3>
                <p className="text-sm text-[#526762] mt-2 font-light leading-relaxed">
                  Embora localizados no Sul, prestamos assessoria a parceiros corretores de todo o Brasil.
                </p>
              </div>

              <div className="flex items-center gap-2 mt-6">
                <MapPin size={16} className="text-[#407870]" />
                <span className="text-sm font-extrabold text-[#162321]">
                  Suporte Integral em Todo Território Nacional
                </span>
              </div>
            </motion.div>

          </div>

        </div>
      </section>

      {/* PROVA SOCIAL COM TRANSIÇÕES DE HOVER (Depoimentos DuoLife) */}
      <section className="py-28 px-6 bg-[#F7FAF9]">
        <div className="w-[min(92%,1800px)] mx-auto">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20">
            <div>
              <span className="text-xs font-bold tracking-wider text-[#407870] uppercase">Experiência do Parceiro</span>
              <h2 className="text-4xl font-black tracking-tight mt-3 text-[#162321]">
                O que dizem os nossos parceiros.
              </h2>
            </div>
            <div className="mt-4 md:mt-0 flex items-center gap-3 bg-white border border-[#d7e3df] px-4.5 py-2.5 rounded-2xl shadow-sm">
              <div className="flex text-[#FFBB00]">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current animate-pulse" />)}
              </div>
              <span className="text-xs font-black text-[#162321]">Nota máxima dos corretores</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, index) => (
              <motion.div 
                key={t.id} 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                whileHover={{ y: -6, boxShadow: '0 20px 40px -15px rgba(64,120,112,0.1)' }}
                className="bg-white p-8 rounded-[32px] border border-[#d7e3df]/60 shadow-sm transition-all duration-300 flex flex-col justify-between h-80"
              >
                <div>
                  <div className="flex text-[#FFBB00] mb-4">
                    {[...Array(t.rating)].map((_, i) => <Star key={i} className="w-4.5 h-4.5 fill-current" />)}
                  </div>
                  <p className="text-[#526762] text-sm font-light leading-relaxed">
                    "{t.comment}"
                  </p>
                </div>
                
                <div className="flex items-center gap-4 mt-6 pt-5 border-t border-[#edf4f2]">
                  <div className="w-11 h-11 rounded-xl bg-[#407870]/10 text-[#407870] flex items-center justify-center font-bold text-base">
                    {t.initials}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#162321]">{t.name}</h4>
                    <p className="text-xs text-[#82918e]">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#162321] text-white py-20 px-6 border-t border-[#233532]">
        <div className="w-[min(92%,1800px)] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-20">
          
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-[#407870] flex items-center justify-center text-white font-black text-lg">
                D
              </div>
              <span className="text-lg font-black tracking-tight text-white">DuoLife</span>
            </div>
            <p className="text-xs text-[#82918e] leading-relaxed max-w-xs font-light">
              Assessoria especializada para corretores e consultores em saúde, seguros e benefícios corporativos.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-wider uppercase mb-6 text-[#80a8b0]">Soluções</h4>
            <ul className="space-y-3.5 text-xs text-[#82918e]">
              <li><Link href="/solucoes" className="hover:text-white transition-colors">Saúde Corporativa</Link></li>
              <li><Link href="/solucoes" className="hover:text-white transition-colors">Seguros de Vida</Link></li>
              <li><Link href="/solucoes" className="hover:text-white transition-colors">Planos Odontológicos</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-wider uppercase mb-6 text-[#80a8b0]">Empresa</h4>
            <ul className="space-y-3.5 text-xs text-[#82918e]">
              <li><Link href="/quem-somos" className="hover:text-white transition-colors">Quem Somos</Link></li>
              <li><Link href="/unidades" className="hover:text-white transition-colors">Unidades</Link></li>
              <li><Link href="/seja-parceiro" className="hover:text-white transition-colors">Seja Parceiro</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-black tracking-wider uppercase mb-6 text-[#80a8b0]">Contato</h4>
            <p className="text-xs text-[#82918e] leading-relaxed font-light">
              comercial@duolife.net.br<br />
              +55 (47) 99153-897
            </p>
          </div>

        </div>

        <div className="w-[min(92%,1800px)] mx-auto pt-8 border-t border-[#233532] flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#82918e]">
          <p>© 2026 DuoLife Hub de Negócios. Todos os direitos reservados.</p>
          <div className="flex gap-6">
            <a href="https://www.instagram.com/duolife.hub" target="_blank" rel="noopener" className="hover:text-white transition-colors">Instagram</a>
            <a href="https://www.linkedin.com/company/duolifehub/" target="_blank" rel="noopener" className="hover:text-white transition-colors">LinkedIn</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
