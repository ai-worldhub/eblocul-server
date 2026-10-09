import {
    type AccessAction,
    type AccessScope,
    AccessService,
    defineAction,
    scopeCondition,
    scopeWhere,
} from '../../../src/core/authz/index.ts';
import type { SessionApplication } from '../../../src/core/identity/index.ts';
import { JOURNAL_READ_ENTRIES } from '../../../src/core/journal/index.ts';
import { Prisma } from '../../../src/generated/prisma/client.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    buildJournalWorld,
    type JournalWorld,
} from '../../utils/journal-world.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';

const START = new Date('2026-10-09T09:00:00.000Z');

const COLUMNS = {
    complexId: Prisma.sql`e.complex_id`,
    ownerNodeId: Prisma.sql`e.owner_node_id`,
};

const READ_WITH_ANCESTORS = defineAction({
    name: 'probe.read_with_ancestors',
    kind: 'read',
    grants: {
        administrator: ['perimeter', 'ancestors'],
        owner: ['chain'],
    },
});

const HANDLE_UNADMINISTERED = defineAction({
    name: 'probe.handle_unadministered',
    kind: 'change',
    grants: {
        chief_administrator: [
            'quarter_node',
            'unadministered_nodes',
            'taken_zones',
        ],
    },
});

type Holder = { accountId: string; grantId: string };

type Found = { id: string };

describe('Access scope on the journal table (e2e)', () => {
    const clock = new ClockDouble(START);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    let world: JournalWorld;

    const scopeOf = async (
        holder: Holder,
        action: AccessAction,
        application: SessionApplication = 'admin_panel',
    ): Promise<AccessScope> => {
        const access = await testApp.app.get(AccessService).open(
            {
                sessionId: holder.accountId,
                accountId: holder.accountId,
                application,
            },
            { grantId: holder.grantId, action },
        );
        return access.scope;
    };

    const bySql = async (scope: AccessScope): Promise<string[]> => {
        const rows = await testApp.db.$queryRaw<Found[]>`
            SELECT e.id
            FROM journal.entries e
            WHERE ${scopeCondition(scope, COLUMNS)}
            ORDER BY e.created_at, e.id
        `;
        return rows.map((row) => row.id);
    };

    const byPrisma = async (scope: AccessScope): Promise<string[]> => {
        const rows = await testApp.db.journalEntry.findMany({
            where: scopeWhere(scope),
            select: { id: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map((row) => row.id);
    };

    const entries = (...numbers: number[]): string[] =>
        numbers.map((number) => world.entryIds[number] ?? '');

    beforeEach(async () => {
        world = await buildJournalWorld(testApp, clock);
    });

    it.each([
        ['a zone', 'zoneAdmin', [1, 3, 4, 5, 8]],
        ['a house', 'houseAdmin', [3, 4, 8]],
        ['a chairman of a house', 'chairman', [3, 4, 8]],
        ['the whole quarter', 'chief', [0, 1, 2, 3, 4, 5, 6, 7, 8]],
        ['a complex of one house', 'foreignAdmin', [9]],
    ] as const)(
        'gives the same entries through SQL and through Prisma: %s',
        async (_case, holder, expected) => {
            const scope = await scopeOf(world[holder], JOURNAL_READ_ENTRIES);

            expect(await bySql(scope)).toEqual(entries(...expected));
            expect(await byPrisma(scope)).toEqual(entries(...expected));
        },
    );

    it('gives the same entries for a perimeter with the nodes above it', async () => {
        const scope = await scopeOf(world.houseAdmin, READ_WITH_ANCESTORS);

        expect(await bySql(scope)).toEqual(entries(0, 1, 3, 4, 8));
        expect(await byPrisma(scope)).toEqual(entries(0, 1, 3, 4, 8));
    });

    it('gives the same entries for the chain of a resident', async () => {
        const scope = await scopeOf(
            world.resident,
            READ_WITH_ANCESTORS,
            'resident_app',
        );

        expect(await bySql(scope)).toEqual(entries(0, 1, 3, 4, 8));
        expect(await byPrisma(scope)).toEqual(entries(0, 1, 3, 4, 8));
    });

    it('gives the same entries for the quarter node, taken zones and nodes without an administrator', async () => {
        await membershipSetupOf(testApp).takeZone(
            world.chief.accountId,
            world.housesZone.id,
        );
        const scope = await scopeOf(world.chief, HANDLE_UNADMINISTERED);
        const taken = await testApp.db.journalEntry.findFirstOrThrow({
            where: { action: 'membership.zone_taken' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true },
        });
        const expected = [...entries(0, 2, 6, 7), taken.id];

        expect(scope.withUnadministeredNodes).toBe(true);
        expect(await bySql(scope)).toEqual(expected);
        expect(await byPrisma(scope)).toEqual(expected);
    });
});
