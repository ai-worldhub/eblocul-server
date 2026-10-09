import { AccessService } from '../../../src/core/authz/index.ts';
import {
    actorOf,
    JOURNAL_READ_ENTRIES,
    type JournalActor,
    JournalService,
    SYSTEM_ACTOR,
} from '../../../src/core/journal/index.ts';
import {
    NodeAssignmentService,
    ROLE_ASSIGNED,
    UnitMembershipService,
} from '../../../src/core/membership/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { recordedEntries } from '../../utils/journal-entries.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';
import { type SeededTree, seedTree } from '../../utils/seeded-tree.ts';

const START = new Date('2026-10-09T09:00:00.000Z');
const MINUTE_MS = 60_000;
const NOBODY = '00000000-0000-7000-8000-00000000dead';
const NOWHERE = '00000000-0000-7000-8000-00000000beef';

class Interrupted extends Error {}

describe('Action journal: what membership records (e2e)', () => {
    const clock = new ClockDouble(START);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );
    const setup = membershipSetupOf(testApp);

    let tree: SeededTree;
    let chiefId: string;
    let chief: JournalActor;

    const afterMinute = (): Date => {
        clock.advance(MINUTE_MS);
        return clock.now();
    };

    const system = {
        actorKind: 'system',
        actorAccountId: null,
        actorRole: null,
    };

    const byChief = (): object => ({
        actorKind: 'account',
        actorAccountId: chiefId,
        actorRole: 'chief_administrator',
    });

    beforeEach(async () => {
        tree = await seedTree(testApp);
        chiefId = await setup.addAccount();
        chief = {
            kind: 'account',
            accountId: chiefId,
            role: 'chief_administrator',
        };
    });

    describe('roles', () => {
        it('records who assigned which role to whom and on which node', async () => {
            const administratorId = await setup.addAccount();
            const first = clock.now();
            const byTheSystem = await setup.assign(
                chiefId,
                tree.quarter.id,
                'chief_administrator',
            );
            const second = afterMinute();
            const byTheChief = await setup.assign(
                administratorId,
                tree.apartmentsZone.id,
                'administrator',
                chief,
            );

            expect(await recordedEntries(testApp.db)).toEqual([
                {
                    action: 'membership.role_assigned',
                    complexId: tree.quarter.id,
                    ownerNodeId: tree.quarter.id,
                    ...system,
                    subjectAccountId: chiefId,
                    subjectUnitId: null,
                    details: {
                        assignmentId: byTheSystem.id,
                        role: 'chief_administrator',
                    },
                    createdAt: first,
                },
                {
                    action: 'membership.role_assigned',
                    complexId: tree.quarter.id,
                    ownerNodeId: tree.apartmentsZone.id,
                    ...byChief(),
                    subjectAccountId: administratorId,
                    subjectUnitId: null,
                    details: {
                        assignmentId: byTheChief.id,
                        role: 'administrator',
                    },
                    createdAt: second,
                },
            ]);
        });

        it('records nothing when the role the account already holds is assigned again', async () => {
            await setup.assign(chiefId, tree.quarter.id, 'chief_administrator');
            await setup.assign(chiefId, tree.quarter.id, 'chief_administrator');

            expect(await recordedEntries(testApp.db)).toHaveLength(1);
        });

        it('records the end of a role once, however many times it is ended', async () => {
            const chairmanId = await setup.addAccount();
            const role = await setup.assign(
                chairmanId,
                tree.house.id,
                'chairman',
            );
            const endedAt = afterMinute();
            await setup.endAssignment(role.id, chief);
            await setup.endAssignment(role.id, chief);

            const entries = await recordedEntries(testApp.db);

            expect(entries).toHaveLength(2);
            expect(entries[1]).toEqual({
                action: 'membership.role_ended',
                complexId: tree.house.id,
                ownerNodeId: tree.house.id,
                ...byChief(),
                subjectAccountId: chairmanId,
                subjectUnitId: null,
                details: { assignmentId: role.id, role: 'chairman' },
                createdAt: endedAt,
            });
        });

        it('takes the author and his role from the access of the request', async () => {
            const grant = await setup.assign(
                chiefId,
                tree.quarter.id,
                'chief_administrator',
            );
            const access = await testApp.app.get(AccessService).open(
                {
                    sessionId: chiefId,
                    accountId: chiefId,
                    application: 'admin_panel',
                },
                { grantId: grant.id, action: JOURNAL_READ_ENTRIES },
            );
            const administratorId = await setup.addAccount();

            await setup.assign(
                administratorId,
                tree.housesZone.id,
                'administrator',
                actorOf(access),
            );

            expect((await recordedEntries(testApp.db))[1]).toMatchObject({
                ownerNodeId: tree.housesZone.id,
                ...byChief(),
                subjectAccountId: administratorId,
            });
        });

        it('does not record the binding of a resident to a unit', async () => {
            const residentId = await setup.addAccount();

            await setup.bind(residentId, tree.apartment.id, 'owner');

            expect(await recordedEntries(testApp.db)).toEqual([]);
        });
    });

    describe('taking a zone and returning it', () => {
        const actions = async (): Promise<unknown[]> =>
            (await recordedEntries(testApp.db)).map(
                ({ action, ownerNodeId, actorAccountId, details }) => ({
                    action,
                    ownerNodeId,
                    actorAccountId,
                    details,
                }),
            );

        beforeEach(async () => {
            await setup.assign(chiefId, tree.quarter.id, 'chief_administrator');
            clock.advance(MINUTE_MS);
        });

        it('records the takeover and the return by the chief himself', async () => {
            const takenAt = clock.now();
            const takeover = await setup.takeZone(
                chiefId,
                tree.housesZone.id,
                chief,
            );
            await setup.takeZone(chiefId, tree.housesZone.id, chief);
            const returnedAt = afterMinute();
            await setup.returnZone(takeover.id, chief);
            await setup.returnZone(takeover.id, chief);

            expect((await recordedEntries(testApp.db)).slice(1)).toEqual([
                {
                    action: 'membership.zone_taken',
                    complexId: tree.quarter.id,
                    ownerNodeId: tree.housesZone.id,
                    ...byChief(),
                    subjectAccountId: chiefId,
                    subjectUnitId: null,
                    details: { assignmentId: takeover.id },
                    createdAt: takenAt,
                },
                {
                    action: 'membership.zone_returned',
                    complexId: tree.quarter.id,
                    ownerNodeId: tree.housesZone.id,
                    ...byChief(),
                    subjectAccountId: chiefId,
                    subjectUnitId: null,
                    details: {
                        assignmentId: takeover.id,
                        reason: 'returned_by_chief',
                    },
                    createdAt: returnedAt,
                },
            ]);
        });

        it('records the return to the first administrator of the zone, after his assignment and by its author', async () => {
            const administratorId = await setup.addAccount();
            const takeover = await setup.takeZone(
                chiefId,
                tree.housesZone.id,
                chief,
            );
            const role = await setup.assign(
                administratorId,
                tree.housesZone.id,
                'administrator',
            );

            expect((await actions()).slice(2)).toEqual([
                {
                    action: 'membership.role_assigned',
                    ownerNodeId: tree.housesZone.id,
                    actorAccountId: null,
                    details: { assignmentId: role.id, role: 'administrator' },
                },
                {
                    action: 'membership.zone_returned',
                    ownerNodeId: tree.housesZone.id,
                    actorAccountId: null,
                    details: {
                        assignmentId: takeover.id,
                        reason: 'zone_administrator_assigned',
                    },
                },
            ]);
        });

        it('records the return of every taken zone when the role of the chief ends', async () => {
            const role = await testApp.db.nodeAssignment.findFirstOrThrow({
                where: { accountId: chiefId, role: 'chief_administrator' },
            });
            const houses = await setup.takeZone(
                chiefId,
                tree.housesZone.id,
                chief,
            );
            const apartments = await setup.takeZone(
                chiefId,
                tree.apartmentsZone.id,
                chief,
            );
            await setup.endAssignment(role.id);

            const [ended, ...returned] = (await actions()).slice(3);

            expect(ended).toEqual({
                action: 'membership.role_ended',
                ownerNodeId: tree.quarter.id,
                actorAccountId: null,
                details: {
                    assignmentId: role.id,
                    role: 'chief_administrator',
                },
            });
            expect(returned).toHaveLength(2);
            expect(returned).toEqual(
                expect.arrayContaining([
                    {
                        action: 'membership.zone_returned',
                        ownerNodeId: tree.housesZone.id,
                        actorAccountId: null,
                        details: {
                            assignmentId: houses.id,
                            reason: 'chief_role_ended',
                        },
                    },
                    {
                        action: 'membership.zone_returned',
                        ownerNodeId: tree.apartmentsZone.id,
                        actorAccountId: null,
                        details: {
                            assignmentId: apartments.id,
                            reason: 'chief_role_ended',
                        },
                    },
                ]),
            );
        });
    });

    describe('one transaction for the action and its entry', () => {
        const transactions = (): Transactions => testApp.app.get(Transactions);

        it('shows the entry inside the transaction and leaves none when the action is rolled back', async () => {
            let insideCount = -1;
            const work = transactions().run(async (tx) => {
                await testApp.app.get(NodeAssignmentService).assign(
                    tx,
                    {
                        accountId: chiefId,
                        nodeId: tree.quarter.id,
                        role: 'chief_administrator',
                    },
                    SYSTEM_ACTOR,
                );
                insideCount = await tx.journalEntry.count();
                throw new Interrupted();
            });

            await expect(work).rejects.toBeInstanceOf(Interrupted);
            expect(insideCount).toBe(1);
            expect(await testApp.db.journalEntry.count()).toBe(0);
            expect(await testApp.db.nodeAssignment.count()).toBe(0);
        });

        it('does not let the action happen when the database refuses its entry', async () => {
            const stranger: JournalActor = {
                kind: 'account',
                accountId: NOBODY,
                role: null,
            };

            await expect(
                setup.assign(
                    chiefId,
                    tree.quarter.id,
                    'chief_administrator',
                    stranger,
                ),
            ).rejects.toThrow();

            expect(await testApp.db.nodeAssignment.count()).toBe(0);
            expect(await testApp.db.journalEntry.count()).toBe(0);
        });

        it('does not let the action happen when the rules refuse its entry', async () => {
            const nameless: JournalActor = {
                kind: 'account',
                accountId: 'Test Chief Administrator',
                role: null,
            };

            await expect(
                setup.assign(
                    chiefId,
                    tree.quarter.id,
                    'chief_administrator',
                    nameless,
                ),
            ).rejects.toMatchObject({ code: 'JOURNAL_ENTRY_INVALID' });

            expect(await testApp.db.nodeAssignment.count()).toBe(0);
        });

        it('undoes everything done before an entry on a node that does not exist', async () => {
            const residentId = await setup.addAccount();
            const work = transactions().run(async (tx) => {
                await testApp.app.get(UnitMembershipService).bind(tx, {
                    accountId: residentId,
                    unitId: tree.apartment.id,
                    role: 'owner',
                });
                await testApp.app
                    .get(JournalService)
                    .record(tx, ROLE_ASSIGNED, {
                        actor: SYSTEM_ACTOR,
                        nodeId: NOWHERE,
                        details: {
                            assignmentId: NOBODY,
                            role: 'administrator',
                        },
                    });
            });

            await expect(work).rejects.toMatchObject({
                code: 'JOURNAL_NODE_NOT_FOUND',
            });
            expect(await testApp.db.unitMembership.count()).toBe(0);
            expect(await testApp.db.journalEntry.count()).toBe(0);
        });
    });
});
