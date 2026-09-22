// Utilitários de formatação e máscaras dinâmicas para modais DuoLife Hub
// Codificação UTF-8

export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
] as const;

export type BrazilianUF = (typeof BRAZILIAN_UFS)[number];

export function cleanDigits(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

export function maskCpfCnpj(value: string | null | undefined): string {
  if (!value) return '';
  const digits = cleanDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  // CNPJ: 00.000.000/0000-00
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function maskCnpj(value: string | null | undefined): string {
  if (!value) return '';
  const digits = cleanDigits(value).slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function maskPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = cleanDigits(value).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function maskCep(value: string | null | undefined): string {
  if (!value) return '';
  const digits = cleanDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function formatDateToInput(dateValue?: string | Date | null): string {
  if (!dateValue) return '';
  if (typeof dateValue === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
      return dateValue.slice(0, 10);
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(dateValue)) {
      const parts = dateValue.split('/');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  try {
    const d = new Date(dateValue);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fallback
  }
  return '';
}

export function parseCurrencyToNumber(value: string | number | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (!value) return fallback;
  const str = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!str) return fallback;

  // Se tem vírgula (formato brasileiro: ex. 100.000,00 ou 1.250,50 ou 680,00)
  if (str.includes(',')) {
    const clean = str.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(clean);
    return Number.isFinite(num) ? num : 0;
  }

  // Se NÃO tem vírgula:
  // Caso 1: múltiplos pontos (ex: 1.000.000 ou 10.000.000) -> pontos são separadores de milhar
  if ((str.match(/\./g) || []).length > 1) {
    const clean = str.replace(/\./g, '');
    const num = parseFloat(clean);
    return Number.isFinite(num) ? num : 0;
  }

  // Caso 2: ponto único (ex: 100000.00 ou 361.67 vs 100.000)
  if (str.includes('.')) {
    const parts = str.split('.');
    // Se a parte decimal tem exatamente 3 dígitos e a parte inteira tem até 3 dígitos (ex: 100.000, 500.000, 1.000)
    // trata como separador de milhar brasileiro sem centavos
    if (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3) {
      const clean = str.replace(/\./g, '');
      const num = parseFloat(clean);
      return Number.isFinite(num) ? num : 0;
    }
    // Caso padrão de float / banco de dados (ex: 100000.00, 361.67, 100.5, 680.00)
    const num = parseFloat(str);
    return Number.isFinite(num) ? num : 0;
  }

  // Caso 3: apenas dígitos
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

export function formatCurrencyBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : parseCurrencyToNumber(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
