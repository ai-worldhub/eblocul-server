import {
    NodeAssignmentService,
    type NodeAssignmentSnapshot,
    ZoneTakeoverService,
} from '../../../src/core/membership/index.ts';
import {
    type NodeSnapshot,
    TreeBuildingService,
} from '../../../src/core/structure/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { EventLogger } from '../../../src/shared/logging/event-logger.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { EventLoggerDouble } from '../../utils/event-logger.double.ts';
import {
    membershipRefusalOf,
    membershipSetupOf,
} from '../../utils/membership-setup.ts';
import {
    fulfilledValueOf,
    runOverlapped,
} from '../../utils/overlapped-transactions.ts';
import { type SeededTree, seedTree } from '../../utils/seeded-tree.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const HOUR_MS = 3_600_000;
const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const ROLLBACK = 'roll the transaction back';

type Quarter = SeededTree & { chiefId: string };

describe('Zone takeover by the chief administrator (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const events = new EventLoggerDouble();
    const testApp = useTestApp((builder) =>
        builder
            .overrideProvider(Clock)
            .useValue(clock)
            .overrideProvider(EventLogger)
            .useValue(events),
    );
    const setup = membershipSetupOf(testApp);

    const quarterWithChief = async (): Promise<Quarter> => {
        const tree = await seedTree(testApp);
        const chiefId = await setup.addAccount();
        await setup.assign(chiefId, tree.quarter.id, 'chief_administrator');
        events.clear();
        return { ...tree, chiefId };
    };

    const otherQuarter = async (): Promise<{
        quarter: NodeSnapshot;
        zone: NodeSnapshot;
    }> => {
        const building = testApp.app.get(TreeBuildingService);
        const ids = testApp.app.get(Ids);
        return testApp.app.get(Transactions).run(async (tx) => {
            const quarter = await building.createRoot(tx, {
                id: ids.next(),
                kind: 'quarter',
                name: 'Other Quarter',
                address: null,
            });
            const zone = await building.createChild(tx, {
                id: ids.next(),
                parentId: quarter.id,
                kind: 'zone',
                name: 'Other Zone',
                address: null,
            });
            return { quarter, zone };
        });
    };

    const stored = (assignmentId: string): Promise<NodeAssignmentSnapshot> =>
        testApp.db.nodeAssignment.findUniqueOrThrow({
            where: { id: assignmentId },
        });

    const activeTakeoversOn = (nodeId: string): Promise<number> =>
        testApp.db.nodeAssignment.count({
            where: { nodeId, role: 'zone_takeover', endedAt: null },
        });

    describe('taking a zone', () => {
        it('leaves a dated record of the chief administrator on the zone', async () => {
            const { chiefId, housesZone } = await quarterWithChief();
            clock.advance(HOUR_MS);

            const takeover = await setup.takeZone(chiefId, housesZone.id);

            expect(takeover).toEqual({
                id: takeover.id,
                accountId: chiefId,
                nodeId: housesZone.id,
                role: 'zone_takeover',
                startedAt: clock.now(),
                endedAt: null,
            });
            expect(await stored(takeover.id)).toEqual(takeover);
            expect(events.named('membership.zone_')).toEqual([
                {
                    event: 'membership.zone_taken',
                    fields: {
                        assignmentId: takeover.id,
                        accountId: chiefId,
                        nodeId: housesZone.id,
                    },
                },
            ]);
        });

        it('keeps the first date when the zone is taken again', async () => {
            const { chiefId, housesZone } = await quarterWithChief();
            const first = await setup.takeZone(chiefId, housesZone.id);
            clock.advance(HOUR_MS);

            const repeated = await setup.takeZone(chiefId, housesZone.id);

            expect(repeated).toEqual(first);
            expect(await activeTakeoversOn(housesZone.id)).toBe(1);
            expect(events.named('membership.zone_taken')).toHaveLength(1);
        });

        it('is refused for an account that is not the chief administrator of this quarter', async () => {
            const { quarter, apartmentsZone, housesZone } =
                await quarterWithChief();
            const zoneAdminId = await setup.addAccount();
            const strangerId = await setup.addAccount();
            const other = await otherQuarter();
            const otherChiefId = await setup.addAccount();
            await setup.assign(zoneAdminId, apartmentsZone.id, 'administrator');
            await setup.assign(
                otherChiefId,
                other.quarter.id,
                'chief_administrator',
            );

            for (const [accountId, nodeId] of [
                [zoneAdminId, apartmentsZone.id],
                [strangerId, housesZone.id],
                [otherChiefId, housesZone.id],
            ] as const) {
                expect(
                    await membershipRefusalOf(
                        setup.takeZone(accountId, nodeId),
                    ),
                ).toEqual({
                    code: 'MEMBERSHIP_CHIEF_REQUIRED',
                    details: { nodeId },
                });
            }
            expect(
                await testApp.db.nodeAssignment.count({
                    where: { role: 'zone_takeover' },
                }),
            ).toBe(0);
            expect(quarter.id).not.toBe(other.quarter.id);
        });

        it('covers only a zone of the quarter', async () => {
            const { chiefId, quarter, building, line, house } =
                await quarterWithChief();

            for (const node of [building, line]) {
                expect(
                    await membershipRefusalOf(setup.takeZone(chiefId, node.id)),
                ).toEqual({
                    code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
                    details: { role: 'zone_takeover', nodeKind: node.kind },
                });
            }
            expect(
                await membershipRefusalOf(setup.takeZone(chiefId, quarter.id)),
            ).toEqual({
                code: 'MEMBERSHIP_NODE_KIND_FORBIDDEN',
                details: { role: 'zone_takeover', nodeKind: 'quarter' },
            });
            expect(
                await membershipRefusalOf(setup.takeZone(chiefId, house.id)),
            ).toEqual({
                code: 'MEMBERSHIP_CHIEF_REQUIRED',
                details: { nodeId: house.id },
            });
            expect(
                await membershipRefusalOf(setup.takeZone(chiefId, UNKNOWN_ID)),
            ).toEqual({
                code: 'MEMBERSHIP_NODE_NOT_FOUND',
                details: { nodeId: UNKNOWN_ID },
            });
        });
    });

    describe('a zone administrator becomes active', () => {
        it('ends the takeover in the transaction that assigns the administrator', async () => {
            const { chiefId, housesZone } = await quarterWithChief();
            const zoneAdminId = await setup.addAccount();
            const takeover = await setup.takeZone(chiefId, housesZone.id);
            clock.advance(HOUR_MS);
            events.clear();

            const inside = await testApp.app
                .get(Transactions)
                .run(async (tx) => {
                    await testApp.app.get(NodeAssignmentService).assign(tx, {
                        accountId: zoneAdminId,
                        nodeId: housesZone.id,
                        role: 'administrator',
                    });
                    return tx.nodeAssignment.findUniqueOrThrow({
                        where: { id: takeover.id },
                    });
                });

            expect(inside.endedAt).toEqual(clock.now());
            expect(await stored(takeover.id)).toEqual({
                ...takeover,
                endedAt: clock.now(),
            });
            expect(events.named('membership.zone_returned')).toEqual([
                {
                    event: 'membership.zone_returned',
                    fields: {
                        assignmentId: takeover.id,
                        accountId: chiefId,
                        nodeId: housesZone.id,
                        reason: 'zone_administrator_assigned',
                    },
                },
            ]);
        });

        it('keeps the takeover when the transaction of the assignment rolls back', async () => {
            const { chiefId, housesZone } = await quarterWithChief();
            const zoneAdminId = await setup.addAccount();
            const takeover = await setup.takeZone(chiefId, housesZone.id);

            const work = testApp.app.get(Transactions).run(async (tx) => {
                await testApp.app.get(NodeAssignmentService).assign(tx, {
                    accountId: zoneAdminId,
                    nodeId: housesZone.id,
                    role: 'administrator',
                });
                throw new Error(ROLLBACK);
            });

            await expect(work).rejects.toThrow(ROLLBACK);
            expect(await stored(takeover.id)).toEqual(takeover);
            expect(
                await testApp.db.nodeAssignment.count({
                    where: { role: 'administrator' },
                }),
            ).toBe(0);
        });

        it('leaves the takeover when an administrator of a house inside the zone or a chairman is assigned', async () => {
            const { chiefId, apartmentsZone, building } =
                await quarterWithChief();
            const houseAdminId = await setup.addAccount();
            const chairmanId = await setup.addAccount();
            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);

            await setup.assign(houseAdminId, building.id, 'administrator');
            await setup.assign(chairmanId, apartmentsZone.id, 'chairman');

            expect(await stored(takeover.id)).toEqual(takeover);
        });

        it('ends the takeovers of every chief administrator of the quarter on this zone only', async () => {
            const { chiefId, quarter, apartmentsZone, housesZone } =
                await quarterWithChief();
            const secondChiefId = await setup.addAccount();
            const zoneAdminId = await setup.addAccount();
            await setup.assign(
                secondChiefId,
                quarter.id,
                'chief_administrator',
            );
            const first = await setup.takeZone(chiefId, housesZone.id);
            const second = await setup.takeZone(secondChiefId, housesZone.id);
            const elsewhere = await setup.takeZone(chiefId, apartmentsZone.id);

            await setup.assign(zoneAdminId, housesZone.id, 'administrator');

            expect((await stored(first.id)).endedAt).toEqual(clock.now());
            expect((await stored(second.id)).endedAt).toEqual(clock.now());
            expect(await stored(elsewhere.id)).toEqual(elsewhere);
        });
    });

    describe('a zone with an active administrator', () => {
        it('can be taken: the administrator stays, and the record stays until the chief returns the zone', async () => {
            const { chiefId, apartmentsZone } = await quarterWithChief();
            const zoneAdminId = await setup.addAccount();
            const administrator = await setup.assign(
                zoneAdminId,
                apartmentsZone.id,
                'administrator',
            );

            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);
            clock.advance(HOUR_MS);
            await setup.assign(zoneAdminId, apartmentsZone.id, 'administrator');

            expect(await stored(administrator.id)).toEqual(administrator);
            expect(await stored(takeover.id)).toEqual(takeover);
        });

        it('is returned by the chief: the record ends once, with the moment and the reason', async () => {
            const { chiefId, apartmentsZone } = await quarterWithChief();
            const zoneAdminId = await setup.addAccount();
            await setup.assign(zoneAdminId, apartmentsZone.id, 'administrator');
            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);
            clock.advance(HOUR_MS);
            const returnedAt = clock.now();
            events.clear();

            const returned = await setup.returnZone(takeover.id);
            clock.advance(HOUR_MS);
            const repeated = await setup.returnZone(takeover.id);

            expect(returned).toEqual({ ...takeover, endedAt: returnedAt });
            expect(repeated).toEqual(returned);
            expect(await stored(takeover.id)).toEqual(returned);
            expect(events.named('membership.zone_returned')).toEqual([
                {
                    event: 'membership.zone_returned',
                    fields: {
                        assignmentId: takeover.id,
                        accountId: chiefId,
                        nodeId: apartmentsZone.id,
                        reason: 'returned_by_chief',
                    },
                },
            ]);
        });

        it('keeps the takeover when one more administrator of the zone is assigned', async () => {
            const { chiefId, apartmentsZone } = await quarterWithChief();
            const firstAdminId = await setup.addAccount();
            const secondAdminId = await setup.addAccount();
            await setup.assign(
                firstAdminId,
                apartmentsZone.id,
                'administrator',
            );
            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);

            await setup.assign(
                secondAdminId,
                apartmentsZone.id,
                'administrator',
            );

            expect(await stored(takeover.id)).toEqual(takeover);
        });

        it('loses the takeover when the zone was left without administrators and gets one again', async () => {
            const { chiefId, apartmentsZone } = await quarterWithChief();
            const firstAdminId = await setup.addAccount();
            const secondAdminId = await setup.addAccount();
            const first = await setup.assign(
                firstAdminId,
                apartmentsZone.id,
                'administrator',
            );
            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);
            await setup.endAssignment(first.id);

            await setup.assign(
                secondAdminId,
                apartmentsZone.id,
                'administrator',
            );

            expect((await stored(takeover.id)).endedAt).toEqual(clock.now());
        });
    });

    describe('simultaneous work', () => {
        it('ends a takeover that is still being made when the administrator of the zone is assigned', async () => {
            const { chiefId, housesZone } = await quarterWithChief();
            const zoneAdminId = await setup.addAccount();

            const { first: takeover, second } = await runOverlapped({
                db: testApp.db,
                transactions: testApp.app.get(Transactions),
                first: (tx) =>
                    testApp.app.get(ZoneTakeoverService).takeZone(tx, {
                        accountId: chiefId,
                        nodeId: housesZone.id,
                    }),
                second: (tx) =>
                    testApp.app.get(NodeAssignmentService).assign(tx, {
                        accountId: zoneAdminId,
                        nodeId: housesZone.id,
                        role: 'administrator',
                    }),
            });

            expect(fulfilledValueOf(second)).toMatchObject({
                role: 'administrator',
                endedAt: null,
            });
            expect((await stored(takeover.id)).endedAt).toEqual(clock.now());
            expect(await activeTakeoversOn(housesZone.id)).toBe(0);
        });

        it('keeps a takeover made after the administrator of the zone has been assigned', async () => {
            const { chiefId, housesZone } = await quarterWithChief();
            const zoneAdminId = await setup.addAccount();

            const { first: administrator, second } = await runOverlapped({
                db: testApp.db,
                transactions: testApp.app.get(Transactions),
                first: (tx) =>
                    testApp.app.get(NodeAssignmentService).assign(tx, {
                        accountId: zoneAdminId,
                        nodeId: housesZone.id,
                        role: 'administrator',
                    }),
                second: (tx) =>
                    testApp.app.get(ZoneTakeoverService).takeZone(tx, {
                        accountId: chiefId,
                        nodeId: housesZone.id,
                    }),
            });

            const takeover = fulfilledValueOf(second);
            expect(await stored(administrator.id)).toEqual(administrator);
            expect(await stored(takeover.id)).toEqual(takeover);
            expect(await activeTakeoversOn(housesZone.id)).toBe(1);
        });

        it('returns the zone to an administrator assigned while its only administrator is being ended', async () => {
            const { chiefId, apartmentsZone } = await quarterWithChief();
            const firstAdminId = await setup.addAccount();
            const secondAdminId = await setup.addAccount();
            const only = await setup.assign(
                firstAdminId,
                apartmentsZone.id,
                'administrator',
            );
            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);

            const { second } = await runOverlapped({
                db: testApp.db,
                transactions: testApp.app.get(Transactions),
                first: (tx) =>
                    testApp.app.get(NodeAssignmentService).end(tx, only.id),
                second: (tx) =>
                    testApp.app.get(NodeAssignmentService).assign(tx, {
                        accountId: secondAdminId,
                        nodeId: apartmentsZone.id,
                        role: 'administrator',
                    }),
            });

            expect(fulfilledValueOf(second)).toMatchObject({ endedAt: null });
            expect((await stored(takeover.id)).endedAt).toEqual(clock.now());
            expect(await activeTakeoversOn(apartmentsZone.id)).toBe(0);
        });

        it('keeps the takeover when the first administrator is ended after one more has been assigned', async () => {
            const { chiefId, apartmentsZone } = await quarterWithChief();
            const firstAdminId = await setup.addAccount();
            const secondAdminId = await setup.addAccount();
            const first = await setup.assign(
                firstAdminId,
                apartmentsZone.id,
                'administrator',
            );
            const takeover = await setup.takeZone(chiefId, apartmentsZone.id);

            const { second } = await runOverlapped({
                db: testApp.db,
                transactions: testApp.app.get(Transactions),
                first: (tx) =>
                    testApp.app.get(NodeAssignmentService).assign(tx, {
                        accountId: secondAdminId,
                        nodeId: apartmentsZone.id,
                        role: 'administrator',
                    }),
                second: (tx) =>
                    testApp.app.get(NodeAssignmentService).end(tx, first.id),
            });

            expect(fulfilledValueOf(second).endedAt).toEqual(clock.now());
            expect(await stored(takeover.id)).toEqual(takeover);
            expect(await activeTakeoversOn(apartmentsZone.id)).toBe(1);
        });

        it('refuses a takeover that waited for the end of the role of the chief administrator', async () => {
            const { chiefId, quarter, housesZone } = await quarterWithChief();
            const role = await testApp.db.nodeAssignment.findFirstOrThrow({
                where: { accountId: chiefId, nodeId: quarter.id },
            });

            const { second } = await runOverlapped({
                db: testApp.db,
                transactions: testApp.app.get(Transactions),
                first: (tx) =>
                    testApp.app.get(NodeAssignmentService).end(tx, role.id),
                second: (tx) =>
                    testApp.app.get(ZoneTakeoverService).takeZone(tx, {
                        accountId: chiefId,
                        nodeId: housesZone.id,
                    }),
            });

            expect(second).toMatchObject({
                status: 'rejected',
                reason: { code: 'MEMBERSHIP_CHIEF_REQUIRED' },
            });
            expect(await activeTakeoversOn(housesZone.id)).toBe(0);
        });
    });

    describe('returning and ending', () => {
        it('returns a zone only by the id of a takeover, and ends an assignment only by the id of an assignment', async () => {
            const { chiefId, quarter, housesZone } = await quarterWithChief();
            const takeover = await setup.takeZone(chiefId, housesZone.id);
            const chief = await testApp.db.nodeAssignment.findFirstOrThrow({
                where: { nodeId: quarter.id, role: 'chief_administrator' },
            });

            expect(
                await membershipRefusalOf(setup.returnZone(chief.id)),
            ).toEqual({
                code: 'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                details: { assignmentId: chief.id },
            });
            expect(
                await membershipRefusalOf(setup.endAssignment(takeover.id)),
            ).toEqual({
                code: 'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                details: { assignmentId: takeover.id },
            });
            expect(
                await membershipRefusalOf(setup.returnZone(UNKNOWN_ID)),
            ).toEqual({
                code: 'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                details: { assignmentId: UNKNOWN_ID },
            });
            expect(await stored(takeover.id)).toEqual(takeover);
            expect(await stored(chief.id)).toEqual(chief);
        });

        it('ends the takeovers of a chief administrator together with his role, in his quarter only', async () => {
            const { chiefId, quarter, apartmentsZone, housesZone } =
                await quarterWithChief();
            const other = await otherQuarter();
            const secondChiefId = await setup.addAccount();
            await setup.assign(
                chiefId,
                other.quarter.id,
                'chief_administrator',
            );
            await setup.assign(
                secondChiefId,
                quarter.id,
                'chief_administrator',
            );
            const here = await setup.takeZone(chiefId, housesZone.id);
            const alsoHere = await setup.takeZone(chiefId, apartmentsZone.id);
            const there = await setup.takeZone(chiefId, other.zone.id);
            const colleague = await setup.takeZone(
                secondChiefId,
                housesZone.id,
            );
            const role = await testApp.db.nodeAssignment.findFirstOrThrow({
                where: {
                    accountId: chiefId,
                    nodeId: quarter.id,
                    role: 'chief_administrator',
                },
            });
            clock.advance(HOUR_MS);
            events.clear();

            await setup.endAssignment(role.id);

            expect((await stored(here.id)).endedAt).toEqual(clock.now());
            expect((await stored(alsoHere.id)).endedAt).toEqual(clock.now());
            expect(await stored(there.id)).toEqual(there);
            expect(await stored(colleague.id)).toEqual(colleague);
            expect(
                events
                    .named('membership.zone_returned')
                    .map(({ fields }) => fields),
            ).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        assignmentId: here.id,
                        reason: 'chief_role_ended',
                    }),
                    expect.objectContaining({
                        assignmentId: alsoHere.id,
                        reason: 'chief_role_ended',
                    }),
                ]),
            );
            expect(events.named('membership.zone_returned')).toHaveLength(2);
        });

        it('refuses a takeover after the role of the chief administrator has ended', async () => {
            const { chiefId, quarter, housesZone } = await quarterWithChief();
            const role = await testApp.db.nodeAssignment.findFirstOrThrow({
                where: { accountId: chiefId, nodeId: quarter.id },
            });
            await setup.endAssignment(role.id);

            expect(
                await membershipRefusalOf(
                    setup.takeZone(chiefId, housesZone.id),
                ),
            ).toEqual({
                code: 'MEMBERSHIP_CHIEF_REQUIRED',
                details: { nodeId: housesZone.id },
            });
        });
    });
});
