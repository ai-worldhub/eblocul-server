import { NodeAssignmentEntity } from '../../../src/core/membership/domain/entities/node-assignment.entity.ts';
import type {
    AppointedRole,
    AssignedNode,
    NodeKind,
} from '../../../src/core/membership/domain/rules/assignment-places.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const LATER = new Date('2026-10-10T09:00:00.000Z');
const ASSIGNMENT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const TAKEOVER_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11';
const ACCOUNT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b20';
const QUARTER_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b30';
const OTHER_QUARTER_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b31';
const NODE_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b40';
const KINDS: NodeKind[] = ['quarter', 'zone', 'building', 'line', 'entrance'];
const ROLES: AppointedRole[] = [
    'chief_administrator',
    'administrator',
    'chairman',
];

const QUARTER: AssignedNode = {
    id: QUARTER_ID,
    complexId: QUARTER_ID,
    kind: 'quarter',
};

const nodeOf = (kind: NodeKind, complexId = QUARTER_ID): AssignedNode =>
    kind === 'quarter'
        ? { id: complexId, complexId, kind }
        : { id: NODE_ID, complexId, kind };

const appoint = (
    role: AppointedRole,
    node: AssignedNode,
): NodeAssignmentEntity =>
    NodeAssignmentEntity.appoint({
        id: ASSIGNMENT_ID,
        accountId: ACCOUNT_ID,
        node,
        role,
        now: NOW,
    });

const acceptedKinds = (role: AppointedRole): NodeKind[] =>
    KINDS.filter((kind) => {
        try {
            appoint(role, nodeOf(kind));
            return true;
        } catch {
            return false;
        }
    });

const takeZone = (
    holder: NodeAssignmentEntity,
    zone: AssignedNode,
): NodeAssignmentEntity =>
    holder.takeZone({ id: TAKEOVER_ID, zone, now: LATER });

describe('NodeAssignmentEntity', () => {
    it('accepts every role only on the node kinds it may be held on', () => {
        expect(
            Object.fromEntries(
                ROLES.map((role) => [role, acceptedKinds(role)]),
            ),
        ).toEqual({
            chief_administrator: ['quarter'],
            administrator: ['zone', 'building', 'line'],
            chairman: ['zone', 'building', 'line'],
        });
    });

    it('names the role and the node kind when it refuses a place', () => {
        expect(() => appoint('administrator', nodeOf('entrance'))).toThrowError(
            expect.objectContaining({
                code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
                details: { role: 'administrator', nodeKind: 'entrance' },
            }),
        );
    });

    it('refuses a chief administrator on a quarter that is not the root of its complex', () => {
        expect(() =>
            appoint('chief_administrator', {
                id: NODE_ID,
                complexId: QUARTER_ID,
                kind: 'quarter',
            }),
        ).toThrowError(
            expect.objectContaining({ code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN' }),
        );
    });

    it('starts active at the given moment', () => {
        const assignment = appoint('administrator', nodeOf('zone'));

        expect(assignment.view()).toEqual({
            id: ASSIGNMENT_ID,
            accountId: ACCOUNT_ID,
            nodeId: NODE_ID,
            role: 'administrator',
            startedAt: NOW,
            endedAt: null,
        });
        expect(assignment.isActive()).toBe(true);
    });

    it('ends once: a repeated end changes nothing', () => {
        const assignment = appoint('chairman', nodeOf('building'));

        expect(assignment.end(NOW)).toBe(true);
        expect(assignment.end(LATER)).toBe(false);
        expect(assignment.view().endedAt).toEqual(NOW);
        expect(assignment.isActive()).toBe(false);
    });

    describe('zone takeover', () => {
        it('gives the chief administrator of the quarter a dated record on the zone', () => {
            const takeover = takeZone(
                appoint('chief_administrator', QUARTER),
                nodeOf('zone'),
            );

            expect(takeover.view()).toEqual({
                id: TAKEOVER_ID,
                accountId: ACCOUNT_ID,
                nodeId: NODE_ID,
                role: 'zone_takeover',
                startedAt: LATER,
                endedAt: null,
            });
            expect(takeover.isTakeover()).toBe(true);
        });

        it('covers a zone only: a building or a line of the quarter is refused', () => {
            const chief = appoint('chief_administrator', QUARTER);

            for (const kind of ['building', 'line', 'entrance'] as const) {
                expect(() => takeZone(chief, nodeOf(kind))).toThrowError(
                    expect.objectContaining({
                        code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
                        details: { role: 'zone_takeover', nodeKind: kind },
                    }),
                );
            }
        });

        it('is refused for a zone of another quarter', () => {
            const chief = appoint('chief_administrator', QUARTER);

            expect(() =>
                takeZone(chief, nodeOf('zone', OTHER_QUARTER_ID)),
            ).toThrowError(
                expect.objectContaining({ code: 'MEMBERSHIP_CHIEF_REQUIRED' }),
            );
        });

        it('is refused once the role of the chief administrator has ended', () => {
            const chief = appoint('chief_administrator', QUARTER);
            chief.end(NOW);

            expect(() => takeZone(chief, nodeOf('zone'))).toThrowError(
                expect.objectContaining({ code: 'MEMBERSHIP_CHIEF_REQUIRED' }),
            );
        });

        it('is refused for an administrator and for a chairman', () => {
            for (const role of ['administrator', 'chairman'] as const) {
                const holder = appoint(role, {
                    id: QUARTER_ID,
                    complexId: QUARTER_ID,
                    kind: 'zone',
                });

                expect(() => takeZone(holder, nodeOf('zone'))).toThrowError(
                    expect.objectContaining({
                        code: 'MEMBERSHIP_CHIEF_REQUIRED',
                    }),
                );
            }
        });
    });

    it('knows which roles end zone takeovers', () => {
        const flags = (
            assignment: NodeAssignmentEntity,
        ): Record<string, boolean> => ({
            releasesNode: assignment.releasesTakeoversOfNode(),
            holdsTakeovers: assignment.holdsTakeovers(),
            isTakeover: assignment.isTakeover(),
        });
        const chief = appoint('chief_administrator', QUARTER);

        expect(flags(chief)).toEqual({
            releasesNode: false,
            holdsTakeovers: true,
            isTakeover: false,
        });
        expect(flags(appoint('administrator', nodeOf('zone')))).toEqual({
            releasesNode: true,
            holdsTakeovers: false,
            isTakeover: false,
        });
        expect(flags(appoint('chairman', nodeOf('zone')))).toEqual({
            releasesNode: false,
            holdsTakeovers: false,
            isTakeover: false,
        });
        expect(flags(takeZone(chief, nodeOf('zone')))).toEqual({
            releasesNode: false,
            holdsTakeovers: false,
            isTakeover: true,
        });
    });
});
