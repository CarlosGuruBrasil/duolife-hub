export type PeriodPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export const DATE_PRESET_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'all', label: 'Todo o período' },
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'this_year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function getPeriodLabel(preset?: string, startDate?: string, endDate?: string): string {
  if (!preset || preset === '30d') return 'Últimos 30 dias';
  if (preset === 'all') return 'Todo o período';
  if (preset === 'today') return 'Hoje';
  if (preset === 'yesterday') return 'Ontem';
  if (preset === '7d') return 'Últimos 7 dias';
  if (preset === 'this_month') return 'Este mês';
  if (preset === 'last_month') return 'Mês passado';
  if (preset === 'this_year') return 'Este ano';
  if (preset === 'custom') {
    if (startDate && endDate) return `${formatDateBR(startDate)} até ${formatDateBR(endDate)}`;
    if (startDate) return `A partir de ${formatDateBR(startDate)}`;
    if (endDate) return `Até ${formatDateBR(endDate)}`;
    return 'Personalizado';
  }
  return preset;
}

export function resolveDateRange(preset?: string, startDate?: string, endDate?: string) {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === 'yesterday') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === '7d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === '30d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (startDate || endDate) {
    const start = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : null;
    return { start, end };
  }
  return { start: null, end: null };
}
