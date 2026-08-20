// Predicados de papel, sem dependência de Next ou banco — para poderem ser testados isolados.
// Foi exatamente aqui que um erro passou despercebido: estreitar o alcance de um predicado
// não quebra compilação, não quebra tipo, e some com telas inteiras em produção.

export type UserRole =
  | 'duolife_dev'
  | 'duolife_admin'
  | 'duolife_staff'
  | 'partner_director'
  | 'partner_manager'
  | 'partner_broker'
  | 'partner_partner';

export const INTERNAL_ROLES: string[] = ['duolife_dev', 'duolife_admin', 'duolife_staff'];

export const INTERNAL_ROLE_LABEL: Record<string, string> = {
  duolife_dev: 'Desenvolvedor',
  duolife_admin: 'Administrador',
  duolife_staff: 'Operação',
};

// Time interno da DuoLife: enxerga a operação inteira, de todas as corretoras.
export function roleIsInternal(role: string): boolean {
  return INTERNAL_ROLES.includes(role);
}

// Administra a plataforma: cadastra e ativa corretora, define produtos, planos e repasses,
// configura white-label e links públicos, gerencia usuários internos.
export function roleIsPlatformAdmin(role: string): boolean {
  return role === 'duolife_dev' || role === 'duolife_admin';
}

// Apenas o irreversível: exclusão definitiva de registro e ferramentas de diagnóstico.
export function roleIsDev(role: string): boolean {
  return role === 'duolife_dev';
}
