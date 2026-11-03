// Validação e formatação de CPF/CNPJ. Fica aqui porque tanto o cadastro público quanto o cadastro
// interno de parceiro precisam da mesma regra — divergir os dois é como entra lixo no banco.

function digitosIguais(n: string): boolean {
  return /^(\d)\1+$/.test(n);
}

export function validarCnpj(valor: string): boolean {
  const n = valor.replace(/\D/g, '');
  if (n.length !== 14 || digitosIguais(n)) return false;
  const calc = (len: number) => {
    let s = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { s += Number(n[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(n[12]) && calc(13) === Number(n[13]);
}

export function validarCpf(valor: string): boolean {
  const n = valor.replace(/\D/g, '');
  if (n.length !== 11 || digitosIguais(n)) return false;
  const calc = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(n[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(n[9]) && calc(10) === Number(n[10]);
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function formatarCpf(valor: string | null | undefined, fallback = ''): string {
  if (!valor) return fallback;
  const n = somenteDigitos(valor);
  if (n.length !== 11) return valor || fallback;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

export function formatarCnpj(valor: string | null | undefined, fallback = ''): string {
  if (!valor) return fallback;
  const n = somenteDigitos(valor);
  if (n.length !== 14) return valor || fallback;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

export type DocumentoEntidade = {
  person_type?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  documento?: string | null;
  document_number?: string | null;
};

export function formatarDocumento(
  valor: string | null | undefined | DocumentoEntidade,
  fallback = ''
): string {
  if (!valor) return fallback;

  let raw = '';
  if (typeof valor === 'object') {
    if (valor.person_type === 'pf') {
      raw = valor.cpf || valor.documento || valor.document_number || valor.cnpj || '';
    } else {
      raw = valor.cnpj || valor.documento || valor.document_number || valor.cpf || '';
    }
  } else {
    raw = String(valor).trim();
  }

  if (!raw) return fallback;
  const n = somenteDigitos(raw);
  if (n.length === 11) return formatarCpf(n);
  if (n.length === 14) return formatarCnpj(n);
  return raw || fallback;
}

// Alias em inglês para manter compatibilidade com módulos legados
export const formatDocument = formatarDocumento;
