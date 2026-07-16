const DEV_JWT_SECRET = 'duolife-dev-secret-change-in-production';

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET não configurada');
  }
  return DEV_JWT_SECRET;
}

export function getEncodedJwtSecret(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

export interface BootstrapAdminConfig {
  name: string;
  email: string;
  password: string;
  role: 'duolife_admin';
}

const DEV_BOOTSTRAP_ADMIN: BootstrapAdminConfig = {
  name: 'Carlos Eduardo',
  email: 'carlos@guru.dev.br',
  password: 'Cadu$2014',
  role: 'duolife_admin',
};

export function getBootstrapAdminConfig(): BootstrapAdminConfig {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();

  if (name && email && password) {
    return {
      name,
      email,
      password,
      role: 'duolife_admin',
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD são obrigatórias em produção');
  }

  return DEV_BOOTSTRAP_ADMIN;
}
