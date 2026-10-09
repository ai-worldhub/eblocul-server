export type ResidentRole = 'owner' | 'family_member' | 'tenant';

export type AdministratorRole = 'administrator' | 'chairman';

export type ChiefRole = 'chief_administrator';

export type AdministrationRole = AdministratorRole | ChiefRole;

export type AccessRole = ResidentRole | AdministrationRole;

export type Application = 'admin_panel' | 'guard_panel' | 'resident_app';

export const ACCESS_ROLES = [
    'owner',
    'family_member',
    'tenant',
    'chief_administrator',
    'administrator',
    'chairman',
] as const satisfies readonly AccessRole[];

const ROLE_APPLICATIONS: Record<AccessRole, Application> = {
    owner: 'resident_app',
    family_member: 'resident_app',
    tenant: 'resident_app',
    chief_administrator: 'admin_panel',
    administrator: 'admin_panel',
    chairman: 'admin_panel',
};

const READ_ONLY_ROLES: readonly AccessRole[] = ['chairman'];

export const applicationOf = (role: AccessRole): Application =>
    ROLE_APPLICATIONS[role];

export const isReadOnlyRole = (role: AccessRole): boolean =>
    READ_ONLY_ROLES.includes(role);
