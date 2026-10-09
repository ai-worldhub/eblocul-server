import type {
    AdministrationRole,
    ResidentRole,
} from '../rules/access-roles.ts';

export type AssignmentGrant = {
    kind: 'assignment';
    id: string;
    accountId: string;
    role: AdministrationRole;
    complexId: string;
    nodeId: string;
    ancestorIds: string[];
    takenZoneIds: string[];
};

export type MembershipGrant = {
    kind: 'membership';
    id: string;
    accountId: string;
    role: ResidentRole;
    complexId: string;
    unitId: string;
    chainNodeIds: string[];
};

export type Grant = AssignmentGrant | MembershipGrant;
