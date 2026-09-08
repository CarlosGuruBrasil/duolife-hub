/**
 * Utilitário para cálculo de dias úteis e manipulação de datas no padrão brasileiro (America/Sao_Paulo).
 */

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day, 12, 0, 0);
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

function formatDateKey(date: Date): string {
  return `${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
}

/**
 * Retorna os feriados nacionais fixos e móveis do Brasil para um determinado ano.
 */
function getBrazilianHolidays(year: number): Set<string> {
  const holidays = new Set<string>([
    '01-01', // Confraternização Universal
    '04-21', // Tiradentes
    '05-01', // Dia do Trabalhador
    '09-07', // Independência do Brasil
    '10-12', // Nossa Senhora Aparecida
    '11-02', // Finados
    '11-15', // Proclamação da República
    '11-20', // Dia Nacional de Zumbi e da Consciência Negra (Lei 14.759/2023)
    '12-25', // Natal
  ]);

  // Feriados móveis baseados na Páscoa
  const easter = getEasterDate(year);

  // Carnaval: 47 dias antes da Páscoa
  const carnival = new Date(easter.getTime() - 47 * 24 * 60 * 60 * 1000);
  holidays.add(formatDateKey(carnival));

  // Sexta-feira Santa (Paixão de Cristo): 2 dias antes da Páscoa
  const goodFriday = new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000);
  holidays.add(formatDateKey(goodFriday));

  // Corpus Christi: 60 dias após a Páscoa
  const corpusChristi = new Date(easter.getTime() + 60 * 24 * 60 * 60 * 1000);
  holidays.add(formatDateKey(corpusChristi));

  return holidays;
}

/**
 * Converte qualquer valor de data (Date, string ISO, YYYY-MM-DD, DD/MM/YYYY) para um Date seguro ao meio-dia.
 */
export function parseDateSafe(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 12, 0, 0);
  }

  const str = String(input).trim();
  if (!str) return null;

  // Formato YYYY-MM-DD ou YYYY-MM-DDT...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    return new Date(year, month, day, 12, 0, 0);
  }

  // Formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const parts = str.slice(0, 10).split('/');
    const day = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const year = Number(parts[2]);
    return new Date(year, month, day, 12, 0, 0);
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0);
}

/**
 * Retorna uma data no formato string 'YYYY-MM-DD'.
 */
export function formatToISODate(date: Date): string {
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  return `${y}-${m}-${d}`;
}

/**
 * Retorna a data atual (hoje) no fuso horário de Brasília no formato 'YYYY-MM-DD'.
 */
export function getTodayISODate(): string {
  const now = new Date();
  const spDateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [day, month, year] = spDateStr.split('/').map(Number);
  return `${year}-${padZero(month)}-${padZero(day)}`;
}

/**
 * Verifica se um dia é dia útil (segunda a sexta e não feriado nacional).
 */
export function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  // 0 = Domingo, 6 = Sábado
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  const holidays = getBrazilianHolidays(date.getFullYear());
  const key = formatDateKey(date);
  if (holidays.has(key)) {
    return false;
  }

  return true;
}

/**
 * Adiciona uma quantidade de dias úteis a uma data base.
 * Retorna no formato 'YYYY-MM-DD'.
 */
export function addBusinessDays(baseDate: Date | string, days: number): string {
  const start = parseDateSafe(baseDate) || parseDateSafe(getTodayISODate())!;
  const current = new Date(start.getTime());
  let count = 0;

  while (count < days) {
    current.setDate(current.getDate() + 1);
    if (isBusinessDay(current)) {
      count++;
    }
  }

  return formatToISODate(current);
}

/**
 * Compara duas datas considerando apenas o dia (YYYY-MM-DD).
 * Retorna:
 *  - negativo se dateA < dateB
 *  - 0 se dateA === dateB
 *  - positivo se dateA > dateB
 */
export function compareDatesOnly(dateA: Date | string, dateB: Date | string): number {
  const aSafe = parseDateSafe(dateA);
  const bSafe = parseDateSafe(dateB);

  if (!aSafe && !bSafe) return 0;
  if (!aSafe) return -1;
  if (!bSafe) return 1;

  const isoA = formatToISODate(aSafe);
  const isoB = formatToISODate(bSafe);

  return isoA.localeCompare(isoB);
}

/**
 * Verifica se uma data é estritamente anterior à data de hoje no fuso de São Paulo.
 */
export function isDateBeforeToday(date: Date | string): boolean {
  return compareDatesOnly(date, getTodayISODate()) < 0;
}
