import type { AccessScope } from '../../../src/core/authz/domain/entities/access-scope.ts';
import type { AccessTarget } from '../../../src/core/authz/domain/entities/access-target.ts';
import type {
    AssignmentGrant,
    Grant,
    MembershipGrant,
} from '../../../src/core/authz/domain/entities/grant.ts';
import {
    type AccessAction,
    defineAction,
} from '../../../src/core/authz/domain/rules/access-action.ts';
import { decide } from '../../../src/core/authz/domain/rules/access-decision.ts';
import type {
    AdministrationRole,
    Application,
    ResidentRole,
} from '../../../src/core/authz/domain/rules/access-roles.ts';

const ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b';
const ACCOUNT = `${ID}00`;
const QUARTER = `${ID}10`;
const ZONE = `${ID}11`;
const OTHER_ZONE = `${ID}12`;
const HOUSE_3 = `${ID}13`;
const HOUSE_4 = `${ID}14`;
const ENTRANCE = `${ID}15`;
const LINE = `${ID}16`;
const OTHER_COMPLEX = `${ID}20`;
const UNIT = `${ID}30`;
const NEIGHBOUR_UNIT = `${ID}31`;
const HOUSE_4_UNIT = `${ID}32`;

const READ = defineAction({
    name: 'probe.read',
    kind: 'read',
    grants: {
        owner: ['chain'],
        family_member: ['chain'],
        tenant: ['chain'],
        administrator: ['perimeter'],
        chairman: ['perimeter'],
        chief_administrator: ['quarter'],
    },
});
const READ_SETTINGS = defineAction({
    name: 'probe.read_settings',
    kind: 'read',
    grants: {
        administrator: ['perimeter', 'ancestors'],
        chairman: ['perimeter', 'ancestors'],
        chief_administrator: ['quarter'],
    },
});
const CHANGE = defineAction({
    name: 'probe.change',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['quarter_node', 'taken_zones'],
    },
});
const HANDLE = defineAction({
    name: 'probe.handle_requests',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['unadministered_nodes', 'taken_zones'],
    },
});
const DEACTIVATE = defineAction({
    name: 'probe.deactivate_resident',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['quarter'],
    },
});
const ISSUE_CODE = defineAction({
    name: 'probe.issue_code',
    kind: 'change',
    grants: { owner: ['chain'] },
});

const LINEAGES: Record<string, string[]> = {
    [QUARTER]: [QUARTER],
    [ZONE]: [ZONE, QUARTER],
    [OTHER_ZONE]: [OTHER_ZONE, QUARTER],
    [HOUSE_3]: [HOUSE_3, ZONE, QUARTER],
    [HOUSE_4]: [HOUSE_4, ZONE, QUARTER],
    [ENTRANCE]: [ENTRANCE, HOUSE_3, ZONE, QUARTER],
    [LINE]: [LINE, OTHER_ZONE, QUARTER],
    [OTHER_COMPLEX]: [OTHER_COMPLEX],
};

const UNIT_NODES: Record<string, string> = {
    [UNIT]: ENTRANCE,
    [NEIGHBOUR_UNIT]: ENTRANCE,
    [HOUSE_4_UNIT]: HOUSE_4,
};

const ADMINISTERED = [ZONE, HOUSE_3, HOUSE_4, ENTRANCE];

const node = (nodeId: string, isAdministered?: boolean): AccessTarget => ({
    unitId: null,
    nodeId,
    complexId: LINEAGES[nodeId]?.at(-1) ?? nodeId,
    lineageIds: LINEAGES[nodeId] ?? [nodeId],
    isAdministered: isAdministered ?? ADMINISTERED.includes(nodeId),
});

const unit = (unitId: string): AccessTarget => ({
    ...node(UNIT_NODES[unitId] ?? ENTRANCE),
    unitId,
});

const assigned = (
    role: AdministrationRole,
    nodeId: string,
    takenZoneIds: string[] = [],
): AssignmentGrant => ({
    kind: 'assignment',
    id: `${ID}40`,
    accountId: ACCOUNT,
    role,
    complexId: LINEAGES[nodeId]?.at(-1) ?? nodeId,
    nodeId,
    ancestorIds: (LINEAGES[nodeId] ?? []).slice(1),
    takenZoneIds,
});

const resident = (role: ResidentRole): MembershipGrant => ({
    kind: 'membership',
    id: `${ID}41`,
    accountId: ACCOUNT,
    role,
    complexId: QUARTER,
    unitId: UNIT,
    chainNodeIds: LINEAGES[ENTRANCE] ?? [],
});

type Outcome =
    | 'allowed'
    | 'AUTHZ_GRANT_NOT_ACTIVE'
    | 'AUTHZ_TARGET_NOT_FOUND'
    | 'AUTHZ_ACTION_FORBIDDEN';

type Case = [
    title: string,
    grant: Grant | null,
    action: AccessAction,
    target: AccessTarget | null | undefined,
    outcome: Outcome,
    application?: Application,
];

const outcomeOf = ([, grant, action, target, , application]: Case): Outcome => {
    try {
        decide({
            grant,
            application:
                application ??
                (grant?.kind === 'membership' ? 'resident_app' : 'admin_panel'),
            action,
            ...(target === undefined ? {} : { target }),
        });
        return 'allowed';
    } catch (error) {
        return (error as { code: Outcome }).code;
    }
};

const ZONE_ADMIN = assigned('administrator', ZONE);
const HOUSE_ADMIN = assigned('administrator', HOUSE_3);
const CHAIRMAN = assigned('chairman', ZONE);
const CHIEF = assigned('chief_administrator', QUARTER);
const CHIEF_WITH_ZONE = assigned('chief_administrator', QUARTER, [OTHER_ZONE]);
const OWNER = resident('owner');
const TENANT = resident('tenant');
const FAMILY = resident('family_member');

const CASES: Case[] = [
    [
        'zone administrator reads his zone',
        ZONE_ADMIN,
        READ,
        node(ZONE),
        'allowed',
    ],
    [
        'zone administrator reads a house of his zone',
        ZONE_ADMIN,
        READ,
        node(HOUSE_4),
        'allowed',
    ],
    [
        'zone administrator changes an entrance of his zone',
        ZONE_ADMIN,
        CHANGE,
        node(ENTRANCE),
        'allowed',
    ],
    [
        'zone administrator reads a unit of his zone',
        ZONE_ADMIN,
        READ,
        unit(HOUSE_4_UNIT),
        'allowed',
    ],
    [
        'zone administrator does not see another zone',
        ZONE_ADMIN,
        READ,
        node(OTHER_ZONE),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'zone administrator does not change another zone',
        ZONE_ADMIN,
        CHANGE,
        node(LINE),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'zone administrator does not see another complex',
        ZONE_ADMIN,
        READ,
        node(OTHER_COMPLEX),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'zone administrator does not see a node that does not exist',
        ZONE_ADMIN,
        READ,
        null,
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'zone administrator reads the settings of the quarter',
        ZONE_ADMIN,
        READ_SETTINGS,
        node(QUARTER),
        'allowed',
    ],
    [
        'zone administrator does not change the quarter',
        ZONE_ADMIN,
        CHANGE,
        node(QUARTER),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'zone administrator does not read the data of the quarter node',
        ZONE_ADMIN,
        READ,
        node(QUARTER),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'house administrator changes his house',
        HOUSE_ADMIN,
        CHANGE,
        node(HOUSE_3),
        'allowed',
    ],
    [
        'house administrator does not see the next house',
        HOUSE_ADMIN,
        READ,
        node(HOUSE_4),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'house administrator reads the settings of the zone above',
        HOUSE_ADMIN,
        READ_SETTINGS,
        node(ZONE),
        'allowed',
    ],
    [
        'house administrator does not change the zone above',
        HOUSE_ADMIN,
        CHANGE,
        node(ZONE),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    ['chairman reads his zone', CHAIRMAN, READ, node(HOUSE_3), 'allowed'],
    [
        'chairman changes nothing in his zone',
        CHAIRMAN,
        CHANGE,
        node(HOUSE_3),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chairman handles no request of his zone',
        CHAIRMAN,
        HANDLE,
        node(ZONE),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chairman does not see another zone',
        CHAIRMAN,
        CHANGE,
        node(OTHER_ZONE),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'chairman without a target is refused a change',
        CHAIRMAN,
        CHANGE,
        undefined,
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    ['chief reads any zone', CHIEF, READ, node(HOUSE_3), 'allowed'],
    ['chief changes the quarter node', CHIEF, CHANGE, node(QUARTER), 'allowed'],
    [
        'chief does not change a zone he has not taken',
        CHIEF,
        CHANGE,
        node(OTHER_ZONE),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chief does not change a zone with an administrator',
        CHIEF,
        CHANGE,
        node(HOUSE_3),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chief changes a zone he has taken',
        CHIEF_WITH_ZONE,
        CHANGE,
        node(LINE),
        'allowed',
    ],
    [
        'chief with a taken zone does not change another zone',
        CHIEF_WITH_ZONE,
        CHANGE,
        node(HOUSE_3),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chief handles the requests of a zone without an administrator',
        CHIEF,
        HANDLE,
        node(LINE),
        'allowed',
    ],
    [
        'chief does not handle the requests of a zone with an administrator',
        CHIEF,
        HANDLE,
        node(HOUSE_3),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chief stops handling once the zone gets an administrator',
        CHIEF,
        HANDLE,
        node(LINE, true),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'chief handles the requests of a taken zone that has an administrator',
        CHIEF_WITH_ZONE,
        HANDLE,
        node(LINE, true),
        'allowed',
    ],
    [
        'chief deactivates a resident anywhere in the quarter',
        CHIEF,
        DEACTIVATE,
        unit(HOUSE_4_UNIT),
        'allowed',
    ],
    [
        'chief does not see another complex',
        CHIEF,
        READ,
        node(OTHER_COMPLEX),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'owner reads every node of his chain',
        OWNER,
        READ,
        node(QUARTER),
        'allowed',
    ],
    ['owner reads his entrance', OWNER, READ, node(ENTRANCE), 'allowed'],
    [
        'resident of house 3 does not see house 4',
        TENANT,
        READ,
        node(HOUSE_4),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'resident does not see another zone',
        FAMILY,
        READ,
        node(OTHER_ZONE),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    ['resident reads his unit', TENANT, READ, unit(UNIT), 'allowed'],
    [
        'resident does not see the unit of a neighbour',
        OWNER,
        READ,
        unit(NEIGHBOUR_UNIT),
        'AUTHZ_TARGET_NOT_FOUND',
    ],
    [
        'owner issues a code for his unit',
        OWNER,
        ISSUE_CODE,
        unit(UNIT),
        'allowed',
    ],
    [
        'tenant does not issue a code for his unit',
        TENANT,
        ISSUE_CODE,
        unit(UNIT),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'family member does not issue a code for his unit',
        FAMILY,
        ISSUE_CODE,
        unit(UNIT),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'resident does not change what an administrator changes',
        OWNER,
        CHANGE,
        node(ENTRANCE),
        'AUTHZ_ACTION_FORBIDDEN',
    ],
    [
        'an ended or unknown grant is not active',
        null,
        READ,
        node(ZONE),
        'AUTHZ_GRANT_NOT_ACTIVE',
    ],
    [
        'an ended grant is not active even for a node that does not exist',
        null,
        READ,
        null,
        'AUTHZ_GRANT_NOT_ACTIVE',
    ],
    [
        'an administrator role does not act in the resident application',
        ZONE_ADMIN,
        READ,
        node(ZONE),
        'AUTHZ_GRANT_NOT_ACTIVE',
        'resident_app',
    ],
    [
        'an administrator role does not act in the guard panel',
        CHIEF,
        READ,
        undefined,
        'AUTHZ_GRANT_NOT_ACTIVE',
        'guard_panel',
    ],
    [
        'a resident role does not act in the administration panel',
        OWNER,
        READ,
        node(ENTRANCE),
        'AUTHZ_GRANT_NOT_ACTIVE',
        'admin_panel',
    ],
    [
        'a resident role does not act in the guard panel',
        OWNER,
        READ,
        undefined,
        'AUTHZ_GRANT_NOT_ACTIVE',
        'guard_panel',
    ],
];

const scopeOfCase = (grant: Grant, action: AccessAction): AccessScope =>
    decide({
        grant,
        application:
            grant.kind === 'membership' ? 'resident_app' : 'admin_panel',
        action,
    }).scope;

describe('decide', () => {
    it.each(CASES)('%s', (...testCase) => {
        expect(outcomeOf(testCase)).toBe(testCase[4]);
    });

    describe('scope', () => {
        it('gives an administrator the subtree of his node', () => {
            expect(scopeOfCase(ZONE_ADMIN, READ)).toMatchObject({
                complexId: QUARTER,
                subtreeRootIds: [ZONE],
                nodeIds: [],
                withUnadministeredNodes: false,
            });
        });

        it('adds the nodes above to the settings an administrator reads', () => {
            expect(scopeOfCase(HOUSE_ADMIN, READ_SETTINGS)).toMatchObject({
                subtreeRootIds: [HOUSE_3],
                nodeIds: [ZONE, QUARTER],
            });
        });

        it('gives a resident the exact nodes of his chain', () => {
            expect(scopeOfCase(OWNER, READ)).toMatchObject({
                complexId: QUARTER,
                subtreeRootIds: [],
                nodeIds: [ENTRANCE, HOUSE_3, ZONE, QUARTER],
                withUnadministeredNodes: false,
            });
        });

        it('gives the chief the whole quarter to read and only the quarter node and taken zones to change', () => {
            expect(scopeOfCase(CHIEF_WITH_ZONE, READ)).toMatchObject({
                subtreeRootIds: [QUARTER],
                nodeIds: [],
            });
            expect(scopeOfCase(CHIEF_WITH_ZONE, CHANGE)).toMatchObject({
                subtreeRootIds: [OTHER_ZONE],
                nodeIds: [QUARTER],
                withUnadministeredNodes: false,
            });
            expect(scopeOfCase(CHIEF, CHANGE)).toMatchObject({
                subtreeRootIds: [],
                nodeIds: [QUARTER],
            });
        });

        it('opens to the chief the nodes without an administrator for the requests routed to him', () => {
            expect(scopeOfCase(CHIEF, HANDLE)).toMatchObject({
                subtreeRootIds: [],
                nodeIds: [],
                withUnadministeredNodes: true,
            });
        });
    });
});
