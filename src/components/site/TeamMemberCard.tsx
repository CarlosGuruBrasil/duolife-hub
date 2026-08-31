'use client';

import React from 'react';
import Image from 'next/image';

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  image: string;
  since?: string;
}

export interface TeamMemberCardProps {
  member: TeamMember;
  className?: string;
  showSince?: boolean;
  align?: 'left' | 'center';
}

export function TeamMemberCard({
  member,
  className = '',
  showSince = false,
  align = 'left'
}: TeamMemberCardProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-[24px] sm:rounded-[28px] border border-border bg-[linear-gradient(180deg,#ffffff_0%,#fbfefe_62%,#f5fbfb_100%)] p-4 sm:p-5 lg:p-4.5 xl:p-6 shadow-[0_14px_40px_rgba(14,74,90,0.06)] md:shadow-[0_20px_60px_rgba(14,74,90,0.09)] flex h-full flex-col text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_75px_rgba(14,74,90,0.15)] ${className}`}
    >
      <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-gradient-to-br from-primary/12 via-white to-accent/18 p-1 shadow-[0_10px_20px_rgba(14,74,90,0.07)]">
              <div className="relative w-26 h-26 sm:w-28 sm:h-28 md:w-32 md:h-32 lg:w-28 lg:h-28 xl:w-32 xl:h-32 rounded-full overflow-hidden border border-white/90 bg-white">
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  sizes="(min-width: 1280px) 8rem, (min-width: 768px) 7rem, 6.5rem"
                  className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="inline-flex max-w-full items-center justify-center rounded-full border border-border bg-white/80 px-2 py-0.5 text-[8px] sm:text-[8.5px] font-black uppercase tracking-[0.08em] text-secondary leading-[1.2] whitespace-normal break-words text-center shadow-[0_2px_6px_rgba(14,74,90,0.03)]">
                {member.role}
              </span>
              {showSince && member.since && (
                <span className="inline-flex items-center rounded-full border border-border/80 bg-surface px-1.5 py-0.5 text-[8px] font-bold text-[#4d686f]">
                  {member.since}
                </span>
              )}
            </div>

            <h3 className="mt-2.5 text-[0.76rem] sm:text-[0.80rem] md:text-[0.84rem] lg:text-[0.76rem] xl:text-[0.82rem] 2xl:text-[0.88rem] font-black text-primary uppercase tracking-tight leading-snug text-center text-balance">
              {member.name}
            </h3>

            <p className="mt-2 text-[0.78rem] sm:text-[0.82rem] md:text-[0.85rem] lg:text-[0.78rem] xl:text-[0.83rem] text-[#435a61] font-normal leading-relaxed text-left">
              {member.bio}
            </p>

            {showSince && member.since && (
              <div className="mt-6 w-full border-t border-border pt-4 text-center text-[10px] font-black uppercase tracking-[0.18em] text-secondary">
                {member.since}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamMemberCard;
