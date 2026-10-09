import { AuthzError } from '../authz.errors.ts';
import {
    ACCESS_ROLES,
    type AccessRole,
    type AdministratorRole,
    type ChiefRole,
    isReadOnlyRole,
    type ResidentRole,
} from './access-roles.ts';

export type ActionKind = 'read' | 'change';

export type ResidentCoverage = 'chain';

export type AdministratorCoverage = 'perimeter' | 'ancestors';

export type ChiefCoverage =
    'quarter' | 'quarter_node' | 'unadministered_nodes' | 'taken_zones';

export type Coverage = ResidentCoverage | AdministratorCoverage | ChiefCoverage;

export type ActionGrants = {
    readonly [Role in ResidentRole]?: readonly ResidentCoverage[];
} & {
    readonly [Role in AdministratorRole]?: readonly AdministratorCoverage[];
} & {
    readonly [Role in ChiefRole]?: readonly ChiefCoverage[];
};

export type AccessAction = {
    readonly name: string;
    readonly kind: ActionKind;
    readonly grants: ActionGrants;
};

const NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const KINDS: readonly ActionKind[] = ['read', 'change'];
const CHANGE: ActionKind = 'change';

const RESIDENT_COVERAGES: readonly Coverage[] = ['chain'];
const ADMINISTRATOR_COVERAGES: readonly Coverage[] = ['perimeter', 'ancestors'];
const CHIEF_COVERAGES: readonly Coverage[] = [
    'quarter',
    'quarter_node',
    'unadministered_nodes',
    'taken_zones',
];

const ROLE_COVERAGES: Record<AccessRole, readonly Coverage[]> = {
    owner: RESIDENT_COVERAGES,
    family_member: RESIDENT_COVERAGES,
    tenant: RESIDENT_COVERAGES,
    administrator: ADMINISTRATOR_COVERAGES,
    chairman: ADMINISTRATOR_COVERAGES,
    chief_administrator: CHIEF_COVERAGES,
};

const invalid = (name: string, reason: string): AuthzError =>
    new AuthzError('AUTHZ_ACTION_INVALID', reason, { action: name });

export const coverageOf = (
    action: AccessAction,
    role: AccessRole,
): readonly Coverage[] => action.grants[role] ?? [];

export const rolesOf = (action: AccessAction): AccessRole[] =>
    ACCESS_ROLES.filter((role) => coverageOf(action, role).length > 0);

export const defineAction = (input: AccessAction): AccessAction => {
    if (!NAME_PATTERN.test(input.name)) {
        throw invalid(
            input.name,
            'Action name is <module>.<action> in lower snake_case',
        );
    }
    if (!KINDS.includes(input.kind)) {
        throw invalid(input.name, 'Action is either a read or a change');
    }
    const roles = rolesOf(input);
    if (roles.length === 0) {
        throw invalid(input.name, 'Action is granted to no role');
    }
    for (const role of roles) {
        const isCoverageKnown = coverageOf(input, role).every((coverage) =>
            ROLE_COVERAGES[role].includes(coverage),
        );
        if (!isCoverageKnown) {
            throw invalid(
                input.name,
                'Action names a coverage the role does not have',
            );
        }
        if (input.kind === CHANGE && isReadOnlyRole(role)) {
            throw invalid(
                input.name,
                'A read-only role cannot be granted a changing action',
            );
        }
    }
    return {
        name: input.name,
        kind: input.kind,
        grants: Object.fromEntries(
            roles.map((role) => [role, [...coverageOf(input, role)]]),
        ),
    };
};
