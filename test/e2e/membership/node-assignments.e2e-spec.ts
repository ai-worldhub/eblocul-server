import {
    NodeAssignmentService,
    type NodeAssignmentSnapshot,
} from '../../../src/core/membership/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import type { Tx } from '../../../src/shared/db/tx.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    membershipRefusalOf,
    membershipSetupOf,
} from '../../utils/membership-setup.ts';
import {
    fulfilledValueOf,
    runOverlapped,
} from '../../utils/overlapped-transactions.ts';
import { seedTree } from '../../utils/seeded-tree.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const HOUR_MS = 3_600_000;
const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const ACTIVE_TRIPLE_INDEX =
    'node_assignments_active_account_id_node_id_role_key';

describe('Node assignments (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );
    const setup = membershipSetupOf(testApp);

    const activeOn = async (nodeId: string): Promise<string[][]> => {
        const stored = await testApp.db.nodeAssignment.findMany({
            where: { nodeId, endedAt: null },
            orderBy: { id: 'asc' },
        });
        return stored.map(({ accountId, role }) => [accountId, role]);
    };

    it('assigns an administrator to a node, from the moment of the clock', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();

        const assignment = await setup.assign(
            accountId,
            house.id,
            'administrator',
        );

        expect(assignment).toEqual({
            id: assignment.id,
            accountId,
            nodeId: house.id,
            role: 'administrator',
            startedAt: clock.now(),
            endedAt: null,
        });
        expect(await testApp.db.nodeAssignment.findMany()).toEqual([
            assignment,
        ]);
    });

    it('lets one account be the administrator and the chairman of one node', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();

        await setup.assign(accountId, house.id, 'administrator');
        await setup.assign(accountId, house.id, 'chairman');

        expect(await activeOn(house.id)).toEqual([
            [accountId, 'administrator'],
            [accountId, 'chairman'],
        ]);
    });

    it('adds a second administrator of a node as a second record', async () => {
        const { apartmentsZone } = await seedTree(testApp);
        const first = await setup.addAccount();
        const second = await setup.addAccount();

        await setup.assign(first, apartmentsZone.id, 'administrator');
        await setup.assign(second, apartmentsZone.id, 'administrator');

        expect(await activeOn(apartmentsZone.id)).toEqual([
            [first, 'administrator'],
            [second, 'administrator'],
        ]);
    });

    it('gives an administrator of separate houses a record per house', async () => {
        const { building, line, house } = await seedTree(testApp);
        const accountId = await setup.addAccount();

        await setup.assign(accountId, building.id, 'administrator');
        await setup.assign(accountId, line.id, 'administrator');
        await setup.assign(accountId, house.id, 'administrator');

        const stored = await testApp.db.nodeAssignment.findMany({
            where: { accountId, endedAt: null },
            orderBy: { id: 'asc' },
        });
        expect(stored.map(({ nodeId }) => nodeId)).toEqual([
            building.id,
            line.id,
            house.id,
        ]);
    });

    it('returns the active assignment when the same one is created again', async () => {
        const { quarter } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const first = await setup.assign(
            accountId,
            quarter.id,
            'chief_administrator',
        );
        clock.advance(HOUR_MS);

        const repeated = await setup.assign(
            accountId,
            quarter.id,
            'chief_administrator',
        );

        expect(repeated).toEqual(first);
        expect(await testApp.db.nodeAssignment.count()).toBe(1);
    });

    it('makes a second creation of one assignment wait for the first and gives it the same record', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const assignChairman = (tx: Tx): Promise<NodeAssignmentSnapshot> =>
            testApp.app.get(NodeAssignmentService).assign(tx, {
                accountId,
                nodeId: house.id,
                role: 'chairman',
            });

        const { first, second } = await runOverlapped({
            db: testApp.db,
            transactions: testApp.app.get(Transactions),
            first: assignChairman,
            second: assignChairman,
        });

        expect(fulfilledValueOf(second)).toEqual(first);
        expect(await testApp.db.nodeAssignment.count()).toBe(1);
    });

    it('refuses a role on a node of a kind it cannot be held on, and stores nothing', async () => {
        const { quarter, apartmentsZone, entrance, house } =
            await seedTree(testApp);
        const accountId = await setup.addAccount();

        expect(
            await membershipRefusalOf(
                setup.assign(accountId, entrance.id, 'administrator'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
            details: { role: 'administrator', nodeKind: 'entrance' },
        });
        expect(
            await membershipRefusalOf(
                setup.assign(accountId, quarter.id, 'administrator'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
            details: { role: 'administrator', nodeKind: 'quarter' },
        });
        expect(
            await membershipRefusalOf(
                setup.assign(
                    accountId,
                    apartmentsZone.id,
                    'chief_administrator',
                ),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
            details: { role: 'chief_administrator', nodeKind: 'zone' },
        });
        expect(
            await membershipRefusalOf(
                setup.assign(accountId, house.id, 'chief_administrator'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
            details: { role: 'chief_administrator', nodeKind: 'building' },
        });
        expect(await testApp.db.nodeAssignment.count()).toBe(0);
    });

    it('ends an assignment once and keeps the record', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const assignment = await setup.assign(
            accountId,
            house.id,
            'administrator',
        );
        clock.advance(HOUR_MS);
        const endedAt = clock.now();

        const ended = await setup.endAssignment(assignment.id);
        clock.advance(HOUR_MS);
        const repeated = await setup.endAssignment(assignment.id);

        expect(ended).toEqual({ ...assignment, endedAt });
        expect(repeated).toEqual(ended);
        expect(await testApp.db.nodeAssignment.findMany()).toEqual([ended]);
    });

    it('starts a new record when an ended assignment is given again', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const first = await setup.assign(accountId, house.id, 'administrator');
        await setup.endAssignment(first.id);

        const second = await setup.assign(accountId, house.id, 'administrator');

        expect(second.id).not.toBe(first.id);
        expect(await activeOn(house.id)).toEqual([
            [accountId, 'administrator'],
        ]);
        expect(await testApp.db.nodeAssignment.count()).toBe(2);
    });

    it('refuses an unknown node, an unknown account and an unknown assignment', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();

        expect(
            await membershipRefusalOf(
                setup.assign(accountId, UNKNOWN_ID, 'administrator'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_NODE_NOT_FOUND',
            details: { nodeId: UNKNOWN_ID },
        });
        expect(
            await membershipRefusalOf(
                setup.assign(UNKNOWN_ID, house.id, 'administrator'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_ACCOUNT_NOT_FOUND',
            details: { accountId: UNKNOWN_ID },
        });
        expect(
            await membershipRefusalOf(setup.endAssignment(UNKNOWN_ID)),
        ).toEqual({
            code: 'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
            details: { assignmentId: UNKNOWN_ID },
        });
        expect(await testApp.db.nodeAssignment.count()).toBe(0);
    });

    it('keeps one active record per account, node and role by a partial unique index', async () => {
        const indexes = await testApp.db.$queryRaw<{ indexdef: string }[]>`
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = 'membership'
              AND indexname = ${ACTIVE_TRIPLE_INDEX}
        `;

        expect(indexes).toHaveLength(1);
        expect(indexes[0]?.indexdef).toContain('UNIQUE INDEX');
        expect(indexes[0]?.indexdef).toContain('(account_id, node_id, role)');
        expect(indexes[0]?.indexdef).toContain('WHERE (ended_at IS NULL)');
    });
});
