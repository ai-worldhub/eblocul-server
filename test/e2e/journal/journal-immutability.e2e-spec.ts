import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    recordedEntries,
    type RecordedEntry,
} from '../../utils/journal-entries.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';
import { type SeededTree, seedTree } from '../../utils/seeded-tree.ts';

const REFUSAL = /journal\.entries is append-only/;
const NOBODY = '00000000-0000-7000-8000-00000000dead';
const GUARDS = [
    { name: 'entries_append_only', state: 'O' },
    { name: 'entries_rows_append_only', state: 'O' },
];

type Guard = { name: string; state: string };

describe('Action journal: an entry is never changed or removed (e2e)', () => {
    const testApp = useTestApp();
    const setup = membershipSetupOf(testApp);

    let tree: SeededTree;
    let entryId: string;
    let before: RecordedEntry[];

    const guards = (): Promise<Guard[]> =>
        testApp.db.$queryRaw<Guard[]>`
            SELECT tgname AS name, tgenabled::text AS state
            FROM pg_trigger
            WHERE tgrelid = 'journal.entries'::regclass
              AND NOT tgisinternal
            ORDER BY tgname
        `;

    beforeEach(async () => {
        tree = await seedTree(testApp);
        await setup.assign(
            await setup.addAccount(),
            tree.house.id,
            'administrator',
        );
        const entry = await testApp.db.journalEntry.findFirstOrThrow();
        entryId = entry.id;
        before = await recordedEntries(testApp.db);
    });

    afterEach(async () => {
        expect(await recordedEntries(testApp.db)).toEqual(before);
    });

    describe('through Prisma', () => {
        it('refuses update', async () => {
            await expect(
                testApp.db.journalEntry.update({
                    where: { id: entryId },
                    data: { action: 'membership.role_ended' },
                }),
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses updateMany', async () => {
            await expect(
                testApp.db.journalEntry.updateMany({
                    data: { details: {} },
                }),
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses upsert of an existing entry', async () => {
            await expect(
                testApp.db.journalEntry.upsert({
                    where: { id: entryId },
                    update: { actorKind: 'account', actorAccountId: NOBODY },
                    create: {
                        id: entryId,
                        complexId: tree.house.id,
                        ownerNodeId: tree.house.id,
                        action: 'membership.role_assigned',
                        actorKind: 'system',
                        details: {},
                        createdAt: new Date('2026-10-09T09:00:00.000Z'),
                    },
                }),
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses delete', async () => {
            await expect(
                testApp.db.journalEntry.delete({ where: { id: entryId } }),
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses deleteMany', async () => {
            await expect(testApp.db.journalEntry.deleteMany()).rejects.toThrow(
                REFUSAL,
            );
        });

        it('refuses a change that matches no entry instead of reporting zero rows', async () => {
            await expect(
                testApp.db.journalEntry.updateMany({
                    where: { id: NOBODY },
                    data: { action: 'membership.role_ended' },
                }),
            ).rejects.toThrow(REFUSAL);
            await expect(
                testApp.db.journalEntry.deleteMany({ where: { id: NOBODY } }),
            ).rejects.toThrow(REFUSAL);
        });

        it('fails the whole transaction that tried to change an entry', async () => {
            const accountId = await setup.addAccount();
            const work = testApp.app.get(Transactions).run(async (tx) => {
                await tx.unitMembership.createMany({
                    data: [
                        {
                            id: NOBODY,
                            accountId,
                            unitId: tree.houseApartment.id,
                            role: 'owner',
                            startedAt: new Date('2026-10-09T09:00:00.000Z'),
                            endedAt: null,
                        },
                    ],
                });
                await tx.journalEntry.deleteMany();
            });

            await expect(work).rejects.toThrow(REFUSAL);
            expect(await testApp.db.unitMembership.count()).toBe(0);
        });
    });

    describe('through raw SQL', () => {
        it('refuses UPDATE', async () => {
            await expect(
                testApp.db.$executeRaw`
                    UPDATE journal.entries SET created_at = created_at - interval '1 year'
                `,
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses DELETE', async () => {
            await expect(
                testApp.db.$executeRaw`
                    DELETE FROM journal.entries WHERE id = ${entryId}::uuid
                `,
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses INSERT ... ON CONFLICT DO UPDATE', async () => {
            await expect(
                testApp.db.$executeRaw`
                    INSERT INTO journal.entries (
                        id, complex_id, owner_node_id, action, actor_kind,
                        details, created_at
                    )
                    SELECT e.id, e.complex_id, e.owner_node_id, e.action,
                           e.actor_kind, e.details, e.created_at
                    FROM journal.entries e
                    ON CONFLICT (id) DO UPDATE SET action = 'membership.role_ended'
                `,
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses TRUNCATE of the journal', async () => {
            await expect(
                testApp.db.$executeRaw`TRUNCATE journal.entries`,
            ).rejects.toThrow(REFUSAL);
        });

        it('refuses TRUNCATE of the tree that cascades to the journal', async () => {
            await expect(
                testApp.db.$executeRaw`TRUNCATE structure.nodes CASCADE`,
            ).rejects.toThrow(REFUSAL);
        });

        it('does not let the node of an entry be removed from under it', async () => {
            await expect(
                testApp.db.$executeRaw`
                    DELETE FROM structure.node_ancestors WHERE node_id = ${tree.house.id}::uuid
                `.then(
                    () =>
                        testApp.db.$executeRaw`
                            DELETE FROM structure.nodes WHERE id = ${tree.house.id}::uuid
                        `,
                ),
            ).rejects.toThrow(/foreign key/i);
        });

        it('refuses an entry of an account author without an account', async () => {
            await expect(
                testApp.db.$executeRaw`
                    INSERT INTO journal.entries (
                        id, complex_id, owner_node_id, action, actor_kind,
                        details, created_at
                    )
                    SELECT ${NOBODY}::uuid, e.complex_id, e.owner_node_id,
                           e.action, 'account', e.details, e.created_at
                    FROM journal.entries e
                `,
            ).rejects.toThrow(/entries_actor_check/);
        });
    });

    describe('the guards themselves', () => {
        it('stand on the table', async () => {
            expect(await guards()).toEqual(GUARDS);
        });

        it('stand again after the test database is cleaned', async () => {
            await cleanDatabase(testApp.db);
            before = [];

            expect(await testApp.db.journalEntry.count()).toBe(0);
            expect(await guards()).toEqual(GUARDS);
            await expect(
                testApp.db.$executeRaw`TRUNCATE journal.entries`,
            ).rejects.toThrow(REFUSAL);
        });
    });
});
