import { JOURNAL_ACTIONS } from '../../../src/app/journal-actions.ts';
import { createOpenApiDocument } from '../../../src/app/app.setup.ts';
import { SMALL_SUBTREE_NODES } from '../../../src/core/journal/domain/rules/feed.ts';
import {
    JournalService,
    SYSTEM_ACTOR,
} from '../../../src/core/journal/index.ts';
import { ROLE_ASSIGNED } from '../../../src/core/membership/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import {
    type Actor,
    type Method,
    sendAs,
    signedInAs,
} from '../../utils/access-actors.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    buildJournalWorld,
    type JournalWorld,
} from '../../utils/journal-world.ts';
import { responseBody } from '../../utils/response-body.ts';

const START = new Date('2026-10-09T09:00:00.000Z');
const NOWHERE = '00000000-0000-7000-8000-00000000beef';
const NAMES = { allowKeys: ['firstName', 'lastName'] };
const PAGE = 5;
const SAME_MOMENT_ENTRIES = 23;
const CHISINAU_OFFSET_MS = 3 * 60 * 60 * 1000;

type Person = { id: string; firstName: string | null; lastName: string | null };

type Card = {
    id: string;
    createdAt: string;
    action: string;
    actor: { kind: string; account: Person | null; role: string | null };
    node: { id: string; kind: string; name: string };
    subjectAccount: Person | null;
    subjectUnit: { id: string; type: string; number: string } | null;
    details: Record<string, unknown>;
};

type Page = { items: Card[]; nextCursor: string | null };

type Refusal = { code: string; message: string; details?: unknown };

type Holder = { accountId: string; grantId: string };

type Described = {
    paths: Record<
        string,
        Record<
            string,
            { parameters?: { name: string; schema?: { enum?: string[] } }[] }
        >
    >;
};

const atChisinau = (moment: Date): string =>
    new Date(moment.getTime() + CHISINAU_OFFSET_MS)
        .toISOString()
        .replace('Z', '+03:00');

describe('GET /nodes/:nodeId/journal-entries (e2e)', () => {
    const clock = new ClockDouble(START);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    let world: JournalWorld;

    const pathOf = (nodeId: string, query = ''): string =>
        `/nodes/${nodeId}/journal-entries${query}`;

    const panel = (holder: Holder): Promise<Actor> =>
        signedInAs(testApp, holder.accountId, 'admin_panel');

    const read = async (
        holder: Holder,
        nodeId: string,
        query = '',
    ): Promise<Page> =>
        responseBody<Page>(
            await sendAs(
                testApp,
                await panel(holder),
                holder.grantId,
                'get',
                pathOf(nodeId, query),
            ).expect(200),
            NAMES,
        );

    const idsOf = async (
        holder: Holder,
        nodeId: string,
        query = '',
    ): Promise<string[]> =>
        (await read(holder, nodeId, query)).items.map((item) => item.id);

    const refusal = async (
        holder: Holder,
        nodeId: string,
        status: number,
        query = '',
    ): Promise<Refusal> => {
        const body = responseBody<Refusal & { requestId?: string }>(
            await sendAs(
                testApp,
                await panel(holder),
                holder.grantId,
                'get',
                pathOf(nodeId, query),
            ).expect(status),
        );
        delete body.requestId;
        return body;
    };

    const entries = (...numbers: number[]): string[] =>
        numbers.map((number) => world.entryIds[number] ?? '');

    const personOf = async (accountId: string): Promise<Person> => {
        const account = await testApp.db.account.findUniqueOrThrow({
            where: { id: accountId },
        });
        return {
            id: account.id,
            firstName: account.firstName,
            lastName: account.lastName,
        };
    };

    beforeEach(async () => {
        world = await buildJournalWorld(testApp, clock);
    });

    describe('who reads what', () => {
        it('shows an administrator of a zone his zone with everything below it, and neither the quarter nor the other zone', async () => {
            expect(
                await idsOf(world.zoneAdmin, world.apartmentsZone.id),
            ).toEqual(entries(8, 5, 4, 3, 1));
        });

        it('refuses an administrator of a zone the other zone as if it did not exist, and the quarter as not his', async () => {
            expect(
                await refusal(world.zoneAdmin, world.housesZone.id, 404),
            ).toEqual({ code: 'AUTHZ_TARGET_NOT_FOUND', message: 'Not found' });
            expect(
                await refusal(world.zoneAdmin, world.quarter.id, 403),
            ).toMatchObject({ code: 'AUTHZ_ACTION_FORBIDDEN' });
        });

        it('shows an administrator of a house his house only', async () => {
            expect(await idsOf(world.houseAdmin, world.building.id)).toEqual(
                entries(8, 4, 3),
            );
            expect(
                await refusal(world.houseAdmin, world.apartmentsZone.id, 403),
            ).toMatchObject({ code: 'AUTHZ_ACTION_FORBIDDEN' });
            expect(
                await refusal(world.houseAdmin, world.house4.id, 404),
            ).toMatchObject({ code: 'AUTHZ_TARGET_NOT_FOUND' });
            expect(await idsOf(world.house4Admin, world.house4.id)).toEqual(
                entries(5),
            );
        });

        it('shows a chairman what the administrator of his node reads', async () => {
            expect(await read(world.chairman, world.building.id)).toEqual(
                await read(world.houseAdmin, world.building.id),
            );
        });

        it('shows the chief administrator the whole quarter and any zone of it', async () => {
            expect(await idsOf(world.chief, world.quarter.id)).toEqual(
                entries(8, 7, 6, 5, 4, 3, 2, 1, 0),
            );
            expect(await idsOf(world.chief, world.housesZone.id)).toEqual(
                entries(7, 6, 2),
            );
            expect(await idsOf(world.chief, world.apartmentsZone.id)).toEqual(
                entries(8, 5, 4, 3, 1),
            );
        });

        it('narrows the feed to the node in the path', async () => {
            expect(await idsOf(world.zoneAdmin, world.building.id)).toEqual(
                entries(8, 4, 3),
            );
            expect(await idsOf(world.zoneAdmin, world.entrance.id)).toEqual(
                entries(8),
            );
            expect(await idsOf(world.chief, world.bulkZone.id)).toEqual([]);
        });

        it('keeps the journal of one complex away from the other', async () => {
            expect(await idsOf(world.foreignAdmin, world.house.id)).toEqual(
                entries(9),
            );
        });

        it('gives an entry with its author, his role, the node, the person and the unit it is about', async () => {
            const { items } = await read(world.houseAdmin, world.building.id);

            expect(items).toEqual([
                {
                    id: world.entryIds[8],
                    createdAt: world.times[8]?.toISOString(),
                    action: 'probe.unit_touched',
                    actor: {
                        kind: 'account',
                        account: await personOf(world.houseAdmin.accountId),
                        role: 'administrator',
                    },
                    node: {
                        id: world.entrance.id,
                        kind: 'entrance',
                        name: world.entrance.name,
                    },
                    subjectAccount: await personOf(world.resident.accountId),
                    subjectUnit: {
                        id: world.apartment.id,
                        type: 'apartment',
                        number: world.apartment.number,
                    },
                    details: { attempts: 2 },
                },
                {
                    id: world.entryIds[4],
                    createdAt: world.times[4]?.toISOString(),
                    action: 'membership.role_assigned',
                    actor: { kind: 'system', account: null, role: null },
                    node: {
                        id: world.building.id,
                        kind: 'building',
                        name: world.building.name,
                    },
                    subjectAccount: await personOf(world.chairman.accountId),
                    subjectUnit: null,
                    details: {
                        assignmentId: world.chairman.grantId,
                        role: 'chairman',
                    },
                },
                {
                    id: world.entryIds[3],
                    createdAt: world.times[3]?.toISOString(),
                    action: 'membership.role_assigned',
                    actor: {
                        kind: 'account',
                        account: await personOf(world.zoneAdmin.accountId),
                        role: 'administrator',
                    },
                    node: {
                        id: world.building.id,
                        kind: 'building',
                        name: world.building.name,
                    },
                    subjectAccount: await personOf(world.houseAdmin.accountId),
                    subjectUnit: null,
                    details: {
                        assignmentId: world.houseAdmin.grantId,
                        role: 'administrator',
                    },
                },
            ]);
        });
    });

    describe('who is refused', () => {
        const codeOf = async (
            actor: Actor,
            grantId: string | null,
            nodeId: string,
            status: number,
        ): Promise<string> =>
            responseBody<Refusal>(
                await sendAs(
                    testApp,
                    actor,
                    grantId,
                    'get',
                    pathOf(nodeId),
                ).expect(status),
            ).code;

        it('asks for a session before it looks at the grant', async () => {
            const withGrant = await testApp
                .http()
                .get(`/api/v1${pathOf(world.quarter.id)}`)
                .set('X-Access-Grant', world.chief.grantId)
                .expect(401);
            const withNothing = await testApp
                .http()
                .get(`/api/v1${pathOf(world.quarter.id)}`)
                .expect(401);

            expect(responseBody<Refusal>(withGrant).code).toBe(
                'IDENTITY_SESSION_REQUIRED',
            );
            expect(responseBody<Refusal>(withNothing).code).toBe(
                'IDENTITY_SESSION_REQUIRED',
            );
        });

        it('asks a signed-in administrator which grant he acts by', async () => {
            expect(
                await codeOf(
                    await panel(world.chief),
                    null,
                    world.quarter.id,
                    400,
                ),
            ).toBe('AUTHZ_GRANT_REQUIRED');
        });

        it('refuses a session of the resident application, whatever grant it names', async () => {
            const resident = await signedInAs(
                testApp,
                world.resident.accountId,
                'resident_app',
            );
            const chiefOnPhone = await signedInAs(
                testApp,
                world.chief.accountId,
                'resident_app',
            );

            expect(
                await codeOf(
                    resident,
                    world.resident.grantId,
                    world.entrance.id,
                    403,
                ),
            ).toBe('AUTHZ_ACTION_FORBIDDEN');
            expect(
                await codeOf(
                    chiefOnPhone,
                    world.chief.grantId,
                    world.quarter.id,
                    403,
                ),
            ).toBe('AUTHZ_GRANT_NOT_ACTIVE');
        });

        it('refuses a session of the guard panel', async () => {
            const guard = await signedInAs(
                testApp,
                world.chief.accountId,
                'guard_panel',
            );

            expect(
                await codeOf(guard, world.chief.grantId, world.quarter.id, 403),
            ).toBe('AUTHZ_GRANT_NOT_ACTIVE');
        });

        it('answers a node of another complex exactly as a node that does not exist', async () => {
            const foreign = await refusal(
                world.foreignAdmin,
                world.quarter.id,
                404,
            );

            expect(foreign).toEqual({
                code: 'AUTHZ_TARGET_NOT_FOUND',
                message: 'Not found',
            });
            expect(await refusal(world.foreignAdmin, NOWHERE, 404)).toEqual(
                foreign,
            );
            expect(await refusal(world.foreignAdmin, 'not-an-id', 404)).toEqual(
                foreign,
            );
        });

        it('refuses a grant that has ended', async () => {
            await testApp.db.nodeAssignment.updateMany({
                where: { id: world.zoneAdmin.grantId },
                data: { endedAt: clock.now() },
            });

            expect(
                await refusal(world.zoneAdmin, world.apartmentsZone.id, 403),
            ).toMatchObject({ code: 'AUTHZ_GRANT_NOT_ACTIVE' });
        });
    });

    describe('nothing but reading', () => {
        const CHANGING: Method[] = ['post', 'patch', 'delete'];

        it('has no endpoint that changes or removes an entry', async () => {
            const chief = await panel(world.chief);
            for (const method of CHANGING) {
                await sendAs(
                    testApp,
                    chief,
                    world.chief.grantId,
                    method,
                    pathOf(world.quarter.id),
                ).expect(404);
                await sendAs(
                    testApp,
                    chief,
                    world.chief.grantId,
                    method,
                    `${pathOf(world.quarter.id)}/${world.entryIds[0] ?? ''}`,
                ).expect(404);
            }
            expect(await testApp.db.journalEntry.count()).toBe(10);
        });

        it('describes one operation, a reading one, and lists the actions the filter accepts', () => {
            const document = createOpenApiDocument(
                testApp.app,
            ) as unknown as Described;
            const journal = Object.entries(document.paths).filter(([path]) =>
                path.includes('journal'),
            );

            expect(
                journal.map(([path, item]) => [path, Object.keys(item)]),
            ).toEqual([['/api/v1/nodes/{nodeId}/journal-entries', ['get']]]);
            expect(
                journal[0]?.[1]['get']?.parameters?.filter(
                    (parameter) => parameter.name === 'action',
                ),
            ).toMatchObject([
                {
                    name: 'action',
                    schema: {
                        enum: JOURNAL_ACTIONS.map((action) => action.name),
                    },
                },
            ]);
        });
    });

    describe('filters', () => {
        const by = (parameters: Record<string, string | undefined>): string => {
            const query = new URLSearchParams(
                Object.entries(parameters).flatMap(([name, value]) =>
                    value === undefined ? [] : [[name, value]],
                ),
            ).toString();
            return query === '' ? '' : `?${query}`;
        };

        const moment = (number: number): string =>
            world.times[number]?.toISOString() ?? '';

        it('by the person who acted', async () => {
            const chief = by({ actorAccountId: world.chief.accountId });
            const zoneAdmin = by({
                actorAccountId: world.zoneAdmin.accountId,
            });

            expect(await idsOf(world.chief, world.quarter.id, chief)).toEqual(
                entries(7, 6, 2, 1),
            );
            expect(
                await idsOf(world.chief, world.quarter.id, zoneAdmin),
            ).toEqual(entries(5, 3));
            expect(
                await idsOf(world.zoneAdmin, world.building.id, zoneAdmin),
            ).toEqual(entries(3));
            expect(
                await idsOf(world.zoneAdmin, world.building.id, chief),
            ).toEqual([]);
        });

        it('by the kind of action', async () => {
            expect(
                await idsOf(
                    world.chief,
                    world.quarter.id,
                    by({ action: 'membership.zone_taken' }),
                ),
            ).toEqual(entries(6));
            expect(
                await idsOf(
                    world.zoneAdmin,
                    world.apartmentsZone.id,
                    by({ action: 'membership.role_assigned' }),
                ),
            ).toEqual(entries(5, 4, 3, 1));
            expect(
                await idsOf(
                    world.houseAdmin,
                    world.building.id,
                    by({ action: 'membership.zone_returned' }),
                ),
            ).toEqual([]);
        });

        it('by the period: from a moment inclusive to a moment exclusive', async () => {
            expect(
                await idsOf(
                    world.chief,
                    world.quarter.id,
                    by({ from: moment(3), to: moment(6) }),
                ),
            ).toEqual(entries(5, 4, 3));
            expect(
                await idsOf(
                    world.chief,
                    world.quarter.id,
                    by({ from: moment(7) }),
                ),
            ).toEqual(entries(8, 7));
            expect(
                await idsOf(
                    world.zoneAdmin,
                    world.apartmentsZone.id,
                    by({ to: moment(4) }),
                ),
            ).toEqual(entries(3, 1));
        });

        it('reads a moment written with the offset of the complex as the same moment', async () => {
            const [third, sixth] = [world.times[3], world.times[6]];
            if (third === undefined || sixth === undefined) {
                throw new Error('The journal world has no such moments');
            }

            expect(
                await idsOf(
                    world.chief,
                    world.quarter.id,
                    by({ from: atChisinau(third), to: atChisinau(sixth) }),
                ),
            ).toEqual(entries(5, 4, 3));
        });

        it('by the period, the kind of action and the person together', async () => {
            const together = by({
                from: moment(2),
                to: moment(7),
                action: 'membership.role_assigned',
                actorAccountId: world.chief.accountId,
            });

            expect(
                await idsOf(world.chief, world.quarter.id, together),
            ).toEqual(entries(2));
            expect(
                await idsOf(
                    world.zoneAdmin,
                    world.apartmentsZone.id,
                    by({
                        from: moment(2),
                        action: 'membership.role_assigned',
                        actorAccountId: world.zoneAdmin.accountId,
                    }),
                ),
            ).toEqual(entries(5, 3));
        });

        it.each([
            ['a day instead of a moment', { from: '2026-10-09' }],
            ['a moment without an offset', { to: '2026-10-09T09:00:00' }],
            ['a date that does not exist', { from: '2026-02-30T00:00:00Z' }],
            ['a person that is not an id', { actorAccountId: 'Test Person' }],
            ['a page of no entries', { limit: '0' }],
            ['a page above the limit', { limit: '101' }],
        ])('refuses %s', async (_case, parameters) => {
            expect(
                await refusal(
                    world.chief,
                    world.quarter.id,
                    400,
                    by(parameters),
                ),
            ).toMatchObject({ code: 'VALIDATION_FAILED' });
        });

        it('refuses a period that ends before it starts', async () => {
            expect(
                await refusal(
                    world.chief,
                    world.quarter.id,
                    400,
                    by({ from: moment(5), to: moment(5) }),
                ),
            ).toMatchObject({ code: 'JOURNAL_PERIOD_INVALID' });
        });

        it('refuses a kind of action no module has registered', async () => {
            expect(
                await refusal(
                    world.chief,
                    world.quarter.id,
                    400,
                    by({ action: 'probe.unit_touched' }),
                ),
            ).toMatchObject({ code: 'JOURNAL_ACTION_UNKNOWN' });
        });

        it('refuses a broken cursor', async () => {
            expect(
                await refusal(
                    world.chief,
                    world.quarter.id,
                    400,
                    by({ cursor: 'not-a-cursor' }),
                ),
            ).toMatchObject({ code: 'INVALID_CURSOR' });
        });
    });

    describe('pages', () => {
        const through = async (
            holder: Holder,
            nodeId: string,
            filter = '',
        ): Promise<{ ids: string[]; pages: number }> => {
            const ids: string[] = [];
            let pages = 0;
            let cursor: string | null = null;
            do {
                const query: string = [
                    `limit=${PAGE}`,
                    ...(filter === '' ? [] : [filter]),
                    ...(cursor === null
                        ? []
                        : [`cursor=${encodeURIComponent(cursor)}`]),
                ].join('&');
                const page: Page = await read(holder, nodeId, `?${query}`);
                expect(page.items.length).toBeLessThanOrEqual(PAGE);
                ids.push(...page.items.map((item) => item.id));
                cursor = page.nextCursor;
                pages += 1;
            } while (cursor !== null);
            return { ids, pages };
        };

        const stored = async (nodeIds: string[]): Promise<string[]> =>
            (
                await testApp.db.journalEntry.findMany({
                    where: { ownerNodeId: { in: nodeIds } },
                    select: { id: true },
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                })
            ).map((entry) => entry.id);

        beforeEach(async () => {
            clock.advance(1);
            const journal = testApp.app.get(JournalService);
            const nodeIds = [world.housesZone.id, world.line.id];
            await testApp.app.get(Transactions).run(async (tx) => {
                for (
                    let number = 0;
                    number < SAME_MOMENT_ENTRIES;
                    number += 1
                ) {
                    await journal.record(tx, ROLE_ASSIGNED, {
                        actor: SYSTEM_ACTOR,
                        nodeId: nodeIds[number % nodeIds.length] ?? '',
                        details: {
                            assignmentId: world.chief.grantId,
                            role: 'administrator',
                        },
                    });
                }
            });
        });

        it('lists a small perimeter to the end: nothing lost, nothing repeated, the order holds at one moment', async () => {
            const expected = await stored([world.housesZone.id, world.line.id]);
            const listed = await through(world.chief, world.housesZone.id);

            expect(expected).toHaveLength(SAME_MOMENT_ENTRIES + 3);
            expect(listed.ids).toEqual(expected);
            expect(listed.pages).toBe(Math.ceil(expected.length / PAGE));
        });

        it('lists a big perimeter to the end the same way', async () => {
            const nodes = await testApp.db.node.findMany({
                where: { complexId: world.quarter.id },
                select: { id: true },
            });
            const expected = await stored(nodes.map((node) => node.id));
            const listed = await through(world.chief, world.quarter.id);

            expect(nodes.length).toBeGreaterThan(SMALL_SUBTREE_NODES);
            expect(expected).toHaveLength(SAME_MOMENT_ENTRIES + 9);
            expect(listed.ids).toEqual(expected);
            expect(new Set(listed.ids).size).toBe(listed.ids.length);
        });

        it('keeps the filter on every page', async () => {
            const expected = (
                await testApp.db.journalEntry.findMany({
                    where: {
                        complexId: world.quarter.id,
                        action: 'membership.role_assigned',
                    },
                    select: { id: true },
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                })
            ).map((entry) => entry.id);
            const listed = await through(
                world.chief,
                world.quarter.id,
                'action=membership.role_assigned',
            );

            expect(expected).toHaveLength(SAME_MOMENT_ENTRIES + 6);
            expect(listed.ids).toEqual(expected);
        });

        it('ends on a page that is exactly full', async () => {
            const page = await read(
                world.chief,
                world.housesZone.id,
                `?limit=${SAME_MOMENT_ENTRIES + 3}`,
            );

            expect(page.items).toHaveLength(SAME_MOMENT_ENTRIES + 3);
            expect(page.nextCursor).toBeNull();
        });
    });
});
