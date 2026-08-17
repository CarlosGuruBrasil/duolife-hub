'use client';

import React from 'react';
import Link from 'next/link';

interface PageHeaderProps {
  category?: string;
  title: string;
  subtitle?: string;
  action?: {
    href: string;
    label: string;
    icon?: React.ReactNode;
  };
  children?: React.ReactNode;
}

export function AdminPageHeader({ category, title, subtitle, action, children }: PageHeaderProps) {
  return (
    <section className="admin-hero-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div>
          {category && (
            <span className="admin-eyebrow">
              {category}
            </span>
          )}
          <h1 className="admin-page-title">
            {title}
          </h1>
          {subtitle && (
            <p className="admin-page-copy">
              {subtitle}
            </p>
          )}
        </div>

        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4e0] px-5 py-2.5 text-xs font-black text-[#072a33] shadow-xs hover:bg-[#00b8c4] transition-all shrink-0 uppercase tracking-wider"
          >
            {action.icon}
            <span>{action.label}</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'cyan' | 'success' | 'warning' | 'neutral';
}

export function AdminStatCard({ label, value, subtext, tone = 'cyan' }: StatCardProps) {
  return (
    <div className={`admin-metric-card tone-${tone}`}>
      <div className="admin-metric-label">
        {label}
      </div>
      <div className="admin-metric-value">
        {value}
      </div>
      {subtext && (
        <div className="admin-metric-hint">
          {subtext}
        </div>
      )}
    </div>
  );
}

export function AdminCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`admin-card ${className}`}>
      {children}
    </div>
  );
}

export function AdminTableContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          {children}
        </table>
      </div>
    </div>
  );
}

export function AdminTableHeader({ columns }: { columns: string[] }) {
  return (
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-black uppercase tracking-wider text-[#0e4a5a]">
        {columns.map((col, idx) => (
          <th key={idx} className={`px-5 py-3.5 ${idx === columns.length - 1 ? 'text-right' : ''}`}>
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function AdminEmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="px-6 py-16 text-center flex flex-col items-center justify-center space-y-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
        {icon}
      </div>
      <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-400 max-w-sm font-medium">{description}</p>
    </div>
  );
}
