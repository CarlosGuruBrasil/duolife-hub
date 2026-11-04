import { describe, it, expect } from 'vitest';
import {
  canManageTeam,
  canManageOwnCompany,
  canManageCorretoraWide,
  isInternalUser,
  type AuthUser,
} from '@/lib/auth';
import { roleIsCorretoraManagement } from '@/lib/roles';

describe('Task 4: Segregação de Funções de corretora_staff (VULN-05)', () => {
  const staffUser: AuthUser = {
    userId: 'staff-01',
    partnerId: null,
    name: 'Staff User',
    email: 'staff@test.com',
    corretoraId: 'corr-01',
    role: 'corretora_staff',
    permissions: {},
  };

  const adminCorretoraUser: AuthUser = {
    userId: 'admin-corr-01',
    partnerId: null,
    name: 'Admin User',
    email: 'admin@test.com',
    corretoraId: 'corr-01',
    role: 'corretora_admin',
    permissions: {},
  };

  const managerCorretoraUser: AuthUser = {
    userId: 'manager-corr-01',
    partnerId: null,
    name: 'Manager User',
    email: 'manager@test.com',
    corretoraId: 'corr-01',
    role: 'corretora_manager',
    permissions: {},
  };

  const partnerDirectorUser: AuthUser = {
    userId: 'director-01',
    partnerId: 'partner-01',
    name: 'Director User',
    email: 'director@test.com',
    partnerRole: 'director',
    role: 'partner_director',
    permissions: {},
  };

  describe('1. Verificação de permissões do papel corretora_staff', () => {
    it('roleIsCorretoraManagement deve ser falso para corretora_staff e verdadeiro para admin/manager', () => {
      expect(roleIsCorretoraManagement('corretora_staff')).toBe(false);
      expect(roleIsCorretoraManagement('corretora_admin')).toBe(true);
      expect(roleIsCorretoraManagement('corretora_manager')).toBe(true);
    });

    it('corretora_staff NÃO deve ter canManageTeam (403/bloqueio de gestao de equipe)', () => {
      expect(canManageTeam(staffUser)).toBe(false);
    });

    it('corretora_staff NÃO deve ter canManageOwnCompany', () => {
      expect(canManageOwnCompany(staffUser)).toBe(false);
    });

    it('corretora_staff NÃO deve ter canManageCorretoraWide', () => {
      expect(canManageCorretoraWide(staffUser)).toBe(false);
    });

    it('corretora_admin, corretora_manager e diretores de parceiro devem manter permissao de gestao', () => {
      expect(canManageTeam(adminCorretoraUser)).toBe(true);
      expect(canManageTeam(managerCorretoraUser)).toBe(true);
      expect(canManageTeam(partnerDirectorUser)).toBe(true);

      expect(canManageCorretoraWide(adminCorretoraUser)).toBe(true);
      expect(canManageCorretoraWide(managerCorretoraUser)).toBe(true);
    });
  });
});
