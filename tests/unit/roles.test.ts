import { describe, it, expect } from 'vitest';
import {
  INTERNAL_ROLES,
  CORRETORA_ROLES,
  INTERNAL_ROLE_LABEL,
  CORRETORA_ROLE_LABEL,
  roleIsInternal,
  roleIsCorretora,
  roleIsPlatformAdmin,
  roleIsDev,
  type UserRole,
} from '@/lib/roles';
import {
  normalizePartnerRole,
  toPartnerUserRole,
  normalizePermissions,
  isInternalUser,
  isDevUser,
  isPlatformAdmin,
  canManageOwnCompany,
  canManageTeam,
  canManageCorretoraWide,
  isIndividualPartnerManager,
  type AuthUser,
  type PartnerRole,
} from '@/lib/auth';

describe('roles.ts e auth.ts - Gestão de Papéis, Permissões e Hierarquia de Acesso', () => {
  // Fábrica para criar instâncias mock de AuthUser
  const createAuthUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
    userId: 'usr_test_123',
    partnerId: null,
    corretoraId: null,
    corretoraNome: null,
    name: 'Usuário Teste',
    email: 'teste@duolife.com.br',
    role: 'duolife_admin',
    partnerRole: null,
    managerUserId: null,
    permissions: {},
    ...overrides,
  });

  describe('1. Predicados puros de papéis (roles.ts)', () => {
    it('deve identificar corretamente papéis internos da DuoLife (roleIsInternal)', () => {
      expect(roleIsInternal('duolife_dev')).toBe(true);
      expect(roleIsInternal('duolife_admin')).toBe(true);
      expect(roleIsInternal('duolife_staff')).toBe(true);

      expect(roleIsInternal('corretora_admin')).toBe(false);
      expect(roleIsInternal('partner_director')).toBe(false);
      expect(roleIsInternal('partner_broker')).toBe(false);
      expect(roleIsInternal('qualquer_outro')).toBe(false);
      expect(roleIsInternal('')).toBe(false);
    });

    it('deve identificar corretamente papéis de corretora (roleIsCorretora)', () => {
      expect(roleIsCorretora('corretora_admin')).toBe(true);
      expect(roleIsCorretora('corretora_manager')).toBe(true);
      expect(roleIsCorretora('corretora_staff')).toBe(true);

      expect(roleIsCorretora('duolife_admin')).toBe(false);
      expect(roleIsCorretora('partner_director')).toBe(false);
      expect(roleIsCorretora('partner_broker')).toBe(false);
      expect(roleIsCorretora('visitante')).toBe(false);
    });

    it('deve identificar estritamente administradores da plataforma (roleIsPlatformAdmin)', () => {
      expect(roleIsPlatformAdmin('duolife_dev')).toBe(true);
      expect(roleIsPlatformAdmin('duolife_admin')).toBe(true);

      expect(roleIsPlatformAdmin('duolife_staff')).toBe(false);
      expect(roleIsPlatformAdmin('corretora_admin')).toBe(false);
      expect(roleIsPlatformAdmin('partner_director')).toBe(false);
      expect(roleIsPlatformAdmin('partner_broker')).toBe(false);
    });

    it('apenas duolife_dev deve ser reconhecido como desenvolvedor (roleIsDev)', () => {
      expect(roleIsDev('duolife_dev')).toBe(true);

      expect(roleIsDev('duolife_admin')).toBe(false);
      expect(roleIsDev('duolife_staff')).toBe(false);
      expect(roleIsDev('corretora_admin')).toBe(false);
      expect(roleIsDev('partner_director')).toBe(false);
    });

    it('deve conter constantes e labels oficiais mapeados', () => {
      expect(INTERNAL_ROLES).toEqual(['duolife_dev', 'duolife_admin', 'duolife_staff']);
      expect(CORRETORA_ROLES).toEqual(['corretora_admin', 'corretora_manager', 'corretora_staff']);

      expect(INTERNAL_ROLE_LABEL['duolife_dev']).toBe('Desenvolvedor');
      expect(INTERNAL_ROLE_LABEL['duolife_admin']).toBe('Administrador');
      expect(INTERNAL_ROLE_LABEL['duolife_staff']).toBe('Operação');

      expect(CORRETORA_ROLE_LABEL['corretora_admin']).toBe('Diretor da Corretora');
      expect(CORRETORA_ROLE_LABEL['corretora_manager']).toBe('Gestor da Corretora');
      expect(CORRETORA_ROLE_LABEL['corretora_staff']).toBe('Operação da Corretora');
    });
  });

  describe('2. Normalização de papéis de parceiros e permissões (auth.ts)', () => {
    it('normalizePartnerRole deve mapear aliases comuns para papéis canônicos', () => {
      expect(normalizePartnerRole('admin')).toBe('director');
      expect(normalizePartnerRole('director')).toBe('director');
      expect(normalizePartnerRole('DIRECTOR')).toBe('director');

      expect(normalizePartnerRole('manager')).toBe('manager');
      expect(normalizePartnerRole('MANAGER')).toBe('manager');

      expect(normalizePartnerRole('seller')).toBe('broker');
      expect(normalizePartnerRole('broker')).toBe('broker');

      expect(normalizePartnerRole('viewer')).toBe('partner');
      expect(normalizePartnerRole('partner')).toBe('partner');

      // Default para entradas inválidas ou nulas
      expect(normalizePartnerRole(null)).toBe('broker');
      expect(normalizePartnerRole(undefined)).toBe('broker');
      expect(normalizePartnerRole('desconhecido')).toBe('broker');
    });

    it('toPartnerUserRole deve converter PartnerRole para formato com prefixo partner_', () => {
      expect(toPartnerUserRole('director')).toBe('partner_director');
      expect(toPartnerUserRole('manager')).toBe('partner_manager');
      expect(toPartnerUserRole('broker')).toBe('partner_broker');
      expect(toPartnerUserRole('partner')).toBe('partner_partner');
    });

    it('normalizePermissions deve tratar objetos, JSON em string e valores espúrios', () => {
      expect(normalizePermissions({ pode_exportar: true })).toEqual({ pode_exportar: true });
      expect(normalizePermissions('{"pode_editar": true}')).toEqual({ pode_editar: true });
      expect(normalizePermissions('invalid-json')).toEqual({});
      expect(normalizePermissions(null)).toEqual({});
      expect(normalizePermissions(undefined)).toEqual({});
      expect(normalizePermissions([1, 2, 3])).toEqual({});
      expect(normalizePermissions(12345)).toEqual({});
    });
  });

  describe('3. Matriz de Autorização por Papel de Usuário', () => {
    describe('Perfil duolife_dev', () => {
      const userDev = createAuthUser({ role: 'duolife_dev' });

      it('possui privilégios de desenvolvedor e administração de plataforma', () => {
        expect(isInternalUser(userDev)).toBe(true);
        expect(isDevUser(userDev)).toBe(true);
        expect(isPlatformAdmin(userDev)).toBe(true);
        expect(canManageOwnCompany(userDev)).toBe(true);
        expect(canManageTeam(userDev)).toBe(true);
        expect(canManageCorretoraWide(userDev)).toBe(true);
        expect(isIndividualPartnerManager(userDev)).toBe(false);
      });
    });

    describe('Perfil duolife_admin', () => {
      const userAdmin = createAuthUser({ role: 'duolife_admin' });

      it('possui privilégios de plataforma, mas NÃO possui permissão irreversível de dev', () => {
        expect(isInternalUser(userAdmin)).toBe(true);
        expect(isDevUser(userAdmin)).toBe(false);
        expect(isPlatformAdmin(userAdmin)).toBe(true);
        expect(canManageOwnCompany(userAdmin)).toBe(true);
        expect(canManageTeam(userAdmin)).toBe(true);
        expect(canManageCorretoraWide(userAdmin)).toBe(true);
        expect(isIndividualPartnerManager(userAdmin)).toBe(false);
      });
    });

    describe('Perfil duolife_staff (Operação interna)', () => {
      const userStaff = createAuthUser({ role: 'duolife_staff' });

      it('é usuário interno com escopo amplo, mas não é administrador de plataforma nem dev', () => {
        expect(isInternalUser(userStaff)).toBe(true);
        expect(isDevUser(userStaff)).toBe(false);
        expect(isPlatformAdmin(userStaff)).toBe(false);
        expect(canManageOwnCompany(userStaff)).toBe(true);
        expect(canManageTeam(userStaff)).toBe(true);
        expect(canManageCorretoraWide(userStaff)).toBe(true);
        expect(isIndividualPartnerManager(userStaff)).toBe(false);
      });
    });

    describe('Perfil corretora_admin', () => {
      const userCorretoraAdmin = createAuthUser({
        role: 'corretora_admin',
        corretoraId: 'corr_alpha_1',
      });

      it('gerencia toda a corretora e sua equipe, sem privilégios internos da DuoLife', () => {
        expect(isInternalUser(userCorretoraAdmin)).toBe(false);
        expect(isDevUser(userCorretoraAdmin)).toBe(false);
        expect(isPlatformAdmin(userCorretoraAdmin)).toBe(false);
        expect(canManageOwnCompany(userCorretoraAdmin)).toBe(true);
        expect(canManageTeam(userCorretoraAdmin)).toBe(true);
        expect(canManageCorretoraWide(userCorretoraAdmin)).toBe(true);
        expect(isIndividualPartnerManager(userCorretoraAdmin)).toBe(false);
      });
    });

    describe('Perfil partner_director (Diretor de Parceiro)', () => {
      const userPartnerDirector = createAuthUser({
        role: 'partner_director',
        partnerRole: 'director',
        partnerId: 'partner_omega_7',
        corretoraId: 'corr_alpha_1',
      });

      it('gerencia sua própria empresa e equipe, mas é restrito ao seu partnerId e não acessa corretora ampla', () => {
        expect(isInternalUser(userPartnerDirector)).toBe(false);
        expect(isDevUser(userPartnerDirector)).toBe(false);
        expect(isPlatformAdmin(userPartnerDirector)).toBe(false);
        expect(canManageOwnCompany(userPartnerDirector)).toBe(true);
        expect(canManageTeam(userPartnerDirector)).toBe(true);
        expect(canManageCorretoraWide(userPartnerDirector)).toBe(false);
        expect(isIndividualPartnerManager(userPartnerDirector)).toBe(true);
      });
    });

    describe('Perfil partner_manager (Gerente de Parceiro)', () => {
      const userPartnerManager = createAuthUser({
        role: 'partner_manager',
        partnerRole: 'manager',
        partnerId: 'partner_omega_7',
        corretoraId: 'corr_alpha_1',
      });

      it('gerencia equipe, mas NÃO gerencia configurações da empresa e nem corretora ampla', () => {
        expect(isInternalUser(userPartnerManager)).toBe(false);
        expect(isDevUser(userPartnerManager)).toBe(false);
        expect(isPlatformAdmin(userPartnerManager)).toBe(false);
        expect(canManageOwnCompany(userPartnerManager)).toBe(false);
        expect(canManageTeam(userPartnerManager)).toBe(true);
        expect(canManageCorretoraWide(userPartnerManager)).toBe(false);
        expect(isIndividualPartnerManager(userPartnerManager)).toBe(true);
      });
    });

    describe('Perfil partner_broker (Corretor/Vendedor)', () => {
      const userPartnerBroker = createAuthUser({
        role: 'partner_broker',
        partnerRole: 'broker',
        partnerId: 'partner_omega_7',
        corretoraId: 'corr_alpha_1',
      });

      it('não tem permissão para gerenciar equipe, empresa ou corretora ampla', () => {
        expect(isInternalUser(userPartnerBroker)).toBe(false);
        expect(isDevUser(userPartnerBroker)).toBe(false);
        expect(isPlatformAdmin(userPartnerBroker)).toBe(false);
        expect(canManageOwnCompany(userPartnerBroker)).toBe(false);
        expect(canManageTeam(userPartnerBroker)).toBe(false);
        expect(canManageCorretoraWide(userPartnerBroker)).toBe(false);
        expect(isIndividualPartnerManager(userPartnerBroker)).toBe(false);
      });
    });

    describe('Perfil partner_partner (Parceiro Visualizador)', () => {
      const userPartnerPartner = createAuthUser({
        role: 'partner_partner',
        partnerRole: 'partner',
        partnerId: 'partner_omega_7',
      });

      it('possui privilégios estritamente limitados a visualização pessoal', () => {
        expect(isInternalUser(userPartnerPartner)).toBe(false);
        expect(canManageOwnCompany(userPartnerPartner)).toBe(false);
        expect(canManageTeam(userPartnerPartner)).toBe(false);
        expect(canManageCorretoraWide(userPartnerPartner)).toBe(false);
        expect(isIndividualPartnerManager(userPartnerPartner)).toBe(false);
      });
    });
  });
});
