import { MembershipError } from '../membership.errors.ts';

export type NodeKind = 'quarter' | 'zone' | 'building' | 'line' | 'entrance';

export type AssignmentRole =
    'chief_administrator' | 'administrator' | 'chairman' | 'zone_takeover';

export type AppointedRole = Exclude<AssignmentRole, 'zone_takeover'>;

export type AssignedNode = {
    id: string;
    complexId: string;
    kind: NodeKind;
};

const ROLE_NODE_KINDS: Record<AssignmentRole, readonly NodeKind[]> = {
    chief_administrator: ['quarter'],
    administrator: ['zone', 'building', 'line'],
    chairman: ['zone', 'building', 'line'],
    zone_takeover: ['zone'],
};

const ROOT_ONLY_ROLE: AssignmentRole = 'chief_administrator';
const TAKEOVER_ROLE: AssignmentRole = 'zone_takeover';
const ZONE_HOLDER_ROLE: AssignmentRole = 'administrator';
const TAKEN_NODE_KIND: NodeKind = 'zone';

export const assertRolePlace = (
    role: AssignmentRole,
    node: AssignedNode,
): void => {
    const isKindAccepted = ROLE_NODE_KINDS[role].includes(node.kind);
    const isLevelAccepted =
        role !== ROOT_ONLY_ROLE || node.id === node.complexId;
    if (!isKindAccepted || !isLevelAccepted) {
        throw new MembershipError(
            'MEMBERSHIP_NODE_KIND_FORBIDDEN',
            'This role cannot be held on a node of this kind',
            { role, nodeKind: node.kind },
        );
    }
};

export const holdsZone = (role: AssignmentRole, node: AssignedNode): boolean =>
    role === ZONE_HOLDER_ROLE && node.kind === TAKEN_NODE_KIND;

export const returnsTakenZone = (holdersBefore: number): boolean =>
    holdersBefore === 0;

export const isAppointedRole = (role: AssignmentRole): role is AppointedRole =>
    role !== TAKEOVER_ROLE;
