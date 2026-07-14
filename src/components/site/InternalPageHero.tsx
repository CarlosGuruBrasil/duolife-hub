import Image from 'next/image';
import React from 'react';
import { Sparkles } from 'lucide-react';

interface InternalPageHeroProps {
  badge: string;
  title: React.ReactNode;
  description: string;
  imageSrc: string;
  imageAlt?: string;
  imageClassName?: string;
}

export default function InternalPageHero({
  badge,
  title,
  description,
  imageSrc,
  imageAlt = '',
  imageClassName = 'object-cover object-center',
}: InternalPageHeroProps) {
  return (
    <section className="relative isolate flex min-h-[72svh] items-start overflow-hidden bg-primary-dark text-white md:min-h-[74svh] lg:min-h-[76svh]">
      <Image src={imageSrc} alt={imageAlt} fill priority className={imageClassName} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(0,212,224,0.18)_0%,transparent_36%),linear-gradient(180deg,rgba(7,42,51,0.7)_0%,rgba(7,42,51,0.82)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-primary-dark to-transparent" />

      <div className="relative z-10 mx-auto w-[min(92%,1800px)] px-6 pb-18 pt-24 md:pb-20 md:pt-28 lg:pb-24 lg:pt-32">
        <div className="max-w-[880px] text-left">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-accent shadow-[0_10px_30px_rgba(7,42,51,0.18)] backdrop-blur-md">
            <Sparkles size={13} />
            {badge}
          </div>
          <h1 className="hero-title-wrap-wide max-w-[18ch] text-4xl font-black uppercase leading-[1.02] tracking-[-0.03em] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.32)] md:text-6xl lg:text-[72px] xl:text-[80px]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-base font-light leading-relaxed text-white/84 drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)] md:text-lg">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}
