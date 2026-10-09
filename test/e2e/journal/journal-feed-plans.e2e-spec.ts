import {
    type AccessScope,
    AccessService,
} from '../../../src/core/authz/index.ts';
import { SMALL_SUBTREE_NODES } from '../../../src/core/journal/domain/rules/feed.ts';
import { JOURNAL_READ_ENTRIES } from '../../../src/core/journal/index.ts';
import {
    entriesOnNodesSql,
    entriesUnderNodeSql,
    feedSql,
    subtreeNodeIdsSql,
} from '../../../src/core/journal/infrastructure/prisma/journal-feed-queries.ts';
import type { FeedFilter } from '../../../src/core/journal/ports/journal-feed-queries.port.ts';
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';
import {
    planOf,
    type QueryPlan,
    rowsReadFrom,
    sequentiallyScanned,
} from '../../utils/query-plan.ts';
import { createTestApp, type TestApp } from '../../utils/test-app.factory.ts';

const BUILD_TIMEOUT_MS = 120_000;
const NEWEST = new Date('2026-10-01T09:00:00.000Z');
const MIDDLE = new Date('2026-06-23T09:00:00.000Z');
const BIG = { zones: 4, buildings: 10, entrances: 5 };
const SMALL = { zones: 2, buildings: 3, entrances: 2 };
const SMALL_COMPLEXES = 20;
const BIG_ENTRIES_PER_NODE = 400;
const SMALL_ENTRIES_PER_NODE = 100;
const ACTOR_ENTRIES = 2000;
const INSERT_BATCH = 2000;
const TAKE = 21;
const ZONE_NODES = 1 + BIG.buildings * (1 + BIG.entrances);
const QUARTER_NODES = 1 + BIG.zones * ZONE_NODES;
const HOUSE_NODES = 1 + BIG.entrances;
const SMALL_NODES =
    1 + SMALL.zones * (1 + SMALL.buildings * (1 + SMALL.entrances));
const ENTRIES =
    QUARTER_NODES * BIG_ENTRIES_PER_NODE +
    SMALL_COMPLEXES * SMALL_NODES * SMALL_ENTRIES_PER_NODE +
    ACTOR_ENTRIES;
const TABLE = 'entries';
const LIST_INDEX = 'entries_complex_id_created_at_id_idx';
const NODE_INDEX = 'entries_owner_node_id_created_at_id_idx';
const ACTOR_INDEX = 'entries_actor_account_id_created_at_id_idx';
const SUBTREE_INDEX = 'node_ancestors_ancestor_id_node_id_idx';
const SLACK = 2;
const SMALL_SHARE = 10;

type Shape = { zones: number; buildings: number; entrances: number };

type House = { id: string; entranceIds: string[] };

type Zone = { id: string; houses: House[] };

type Complex = { id: string; zones: Zone[] };

type NodeRow = Prisma.NodeCreateManyInput;

type AncestorRow = Prisma.NodeAncestorCreateManyInput;

type Data = {
    quarter: Complex;
    zone: Zone;
    house: House;
    entranceId: string;
    actorId: string;
    scopes: { quarter: AccessScope; zone: AccessScope; house: AccessScope };
};

const FIRST_PAGE: FeedFilter = {
    from: null,
    to: null,
    action: null,
    actorAccountId: null,
    before: null,
    take: TAKE,
};

describe('Journal feed on a database with many complexes (e2e)', () => {
    let testApp: TestApp | undefined;
    let data: Data | undefined;

    const app = (): TestApp => {
        if (testApp === undefined) {
            throw new Error('The application is not started yet');
        }
        return testApp;
    };

    const built = (): Data => {
        if (data === undefined) {
            throw new Error('The data is not built yet');
        }
        return data;
    };

    const complexOf = (
        shape: Shape,
        name: string,
        nodes: NodeRow[],
        ancestors: AncestorRow[],
    ): Complex => {
        const ids = app().app.get(Ids);
        const add = (kind: NodeRow['kind'], lineage: string[]): string => {
            const id = ids.next();
            nodes.push({
                id,
                complexId: lineage.at(-1) ?? id,
                kind,
                name: `${name} ${kind} ${nodes.length}`,
                address: null,
                createdAt: NEWEST,
            });
            [id, ...lineage].forEach((ancestorId, depth) => {
                ancestors.push({ nodeId: id, ancestorId, depth });
            });
            return id;
        };
        const quarterId = add('quarter', []);
        const zones = Array.from({ length: shape.zones }, () => {
            const zoneId = add('zone', [quarterId]);
            const houses = Array.from({ length: shape.buildings }, () => {
                const houseId = add('building', [zoneId, quarterId]);
                const entranceIds = Array.from(
                    { length: shape.entrances },
                    () => add('entrance', [houseId, zoneId, quarterId]),
                );
                return { id: houseId, entranceIds };
            });
            return { id: zoneId, houses };
        });
        return { id: quarterId, zones };
    };

    const insertTree = async (
        nodes: NodeRow[],
        ancestors: AncestorRow[],
    ): Promise<void> => {
        await app().db.node.createMany({
            data: nodes.filter((node) => node.id === node.complexId),
        });
        const others = nodes.filter((node) => node.id !== node.complexId);
        for (let from = 0; from < others.length; from += INSERT_BATCH) {
            await app().db.node.createMany({
                data: others.slice(from, from + INSERT_BATCH),
            });
        }
        for (let from = 0; from < ancestors.length; from += INSERT_BATCH) {
            await app().db.nodeAncestor.createMany({
                data: ancestors.slice(from, from + INSERT_BATCH),
            });
        }
    };

    const scopeFor = async (grant: {
        id: string;
        accountId: string;
    }): Promise<AccessScope> => {
        const access = await app().app.get(AccessService).open(
            {
                sessionId: grant.accountId,
                accountId: grant.accountId,
                application: 'admin_panel',
            },
            { grantId: grant.id, action: JOURNAL_READ_ENTRIES },
        );
        return access.scope;
    };

    const build = async (): Promise<Data> => {
        const setup = membershipSetupOf(app());
        const nodes: NodeRow[] = [];
        const ancestors: AncestorRow[] = [];
        const quarter = complexOf(BIG, 'Big', nodes, ancestors);
        for (let index = 0; index < SMALL_COMPLEXES; index += 1) {
            complexOf(SMALL, `Small ${index}`, nodes, ancestors);
        }
        await insertTree(nodes, ancestors);
        const zone = quarter.zones[0];
        const house = zone?.houses[0];
        const entranceId = house?.entranceIds[0];
        if (
            zone === undefined ||
            house === undefined ||
            entranceId === undefined
        ) {
            throw new Error('The big quarter is not built');
        }
        const chiefId = await setup.addAccount();
        const zoneAdminId = await setup.addAccount();
        const houseAdminId = await setup.addAccount();
        const actorId = await setup.addAccount();
        const chief = await setup.assign(
            chiefId,
            quarter.id,
            'chief_administrator',
        );
        const zoneAdmin = await setup.assign(
            zoneAdminId,
            zone.id,
            'administrator',
        );
        const houseAdmin = await setup.assign(
            houseAdminId,
            house.id,
            'administrator',
        );

        await app().db.$executeRaw`
            INSERT INTO journal.entries (
                id, complex_id, owner_node_id, action, actor_kind, details,
                created_at
            )
            SELECT
                gen_random_uuid(),
                n.complex_id,
                n.id,
                CASE WHEN random() < 0.1
                    THEN 'membership.zone_taken'
                    ELSE 'membership.role_assigned'
                END,
                'system',
                '{}'::jsonb,
                ${NEWEST}::timestamptz - random() * interval '200 days'
            FROM structure.nodes n
            CROSS JOIN LATERAL generate_series(
                1,
                CASE
                    WHEN n.complex_id = ${quarter.id}::uuid
                        THEN ${BIG_ENTRIES_PER_NODE}::int
                    ELSE ${SMALL_ENTRIES_PER_NODE}::int
                END
            )
        `;
        await app().db.$executeRaw`
            INSERT INTO journal.entries (
                id, complex_id, owner_node_id, actor_account_id, action,
                actor_kind, actor_role, details, created_at
            )
            SELECT
                gen_random_uuid(),
                ${quarter.id}::uuid,
                (ARRAY[${quarter.id}::uuid, ${zone.id}::uuid, ${house.id}::uuid])[1 + number % 3],
                ${actorId}::uuid,
                'membership.role_ended',
                'account',
                'administrator',
                '{}'::jsonb,
                ${NEWEST}::timestamptz - random() * interval '200 days'
            FROM generate_series(1, ${ACTOR_ENTRIES}::int) AS number
        `;
        await app().db.$executeRaw`
            ANALYZE structure.nodes, structure.node_ancestors,
                membership.node_assignments, journal.entries
        `;

        return {
            quarter,
            zone,
            house,
            entranceId,
            actorId,
            scopes: {
                quarter: await scopeFor(chief),
                zone: await scopeFor(zoneAdmin),
                house: await scopeFor(houseAdmin),
            },
        };
    };

    const subtreeOf = (place: Zone | House): string[] =>
        'houses' in place
            ? [place.id, ...place.houses.flatMap((house) => subtreeOf(house))]
            : [place.id, ...place.entranceIds];

    const underNode = (
        scope: AccessScope,
        nodeId: string,
        filter: Partial<FeedFilter> = {},
    ): Promise<QueryPlan> =>
        planOf(
            app().db,
            feedSql(
                entriesUnderNodeSql(scope, nodeId, {
                    ...FIRST_PAGE,
                    ...filter,
                }),
            ),
        );

    const onNodes = (
        scope: AccessScope,
        nodeIds: string[],
        filter: Partial<FeedFilter> = {},
    ): Promise<QueryPlan> =>
        planOf(
            app().db,
            feedSql(
                entriesOnNodesSql(scope, nodeIds, { ...FIRST_PAGE, ...filter }),
            ),
        );

    const readFrom = (plan: QueryPlan): number =>
        rowsReadFrom(plan.scans, TABLE);

    beforeAll(async () => {
        testApp = await createTestApp();
        await cleanDatabase(testApp.db);
        data = await build();
    }, BUILD_TIMEOUT_MS);

    afterAll(async () => {
        if (testApp !== undefined) {
            await cleanDatabase(testApp.db);
            await testApp.app.close();
        }
    });

    it('holds a journal of many complexes', async () => {
        expect(await app().db.node.count()).toBe(
            QUARTER_NODES + SMALL_COMPLEXES * SMALL_NODES,
        );
        expect(await app().db.journalEntry.count()).toBe(ENTRIES + 3);
        expect(subtreeOf(built().house).length).toBeLessThanOrEqual(
            SMALL_SUBTREE_NODES,
        );
        expect(subtreeOf(built().zone).length).toBeGreaterThan(
            SMALL_SUBTREE_NODES,
        );
    });

    it('reads a page of the whole quarter along the list index: a page of rows, not more', async () => {
        const { quarter, scopes } = built();

        const plan = await underNode(scopes.quarter, quarter.id);

        expect(sequentiallyScanned(plan.scans)).not.toContain(TABLE);
        expect(plan.indexes).toContain(LIST_INDEX);
        expect(readFrom(plan)).toBeLessThanOrEqual(TAKE * SLACK);
    });

    it('reads a page of a zone along the list index: a few pages of rows', async () => {
        const { zone, scopes } = built();

        for (const scope of [scopes.zone, scopes.quarter]) {
            const plan = await underNode(scope, zone.id);

            expect(sequentiallyScanned(plan.scans)).not.toContain(TABLE);
            expect(plan.indexes).toContain(LIST_INDEX);
            expect(readFrom(plan)).toBeLessThanOrEqual(
                TAKE * BIG.zones * SLACK,
            );
        }
    });

    it('reads a page of a house node by node along the index of the owner node: a page per node at most', async () => {
        const { house, entranceId, scopes } = built();

        for (const scope of [scopes.house, scopes.zone, scopes.quarter]) {
            const ofHouse = await onNodes(scope, subtreeOf(house));
            const ofEntrance = await onNodes(scope, [entranceId]);

            expect(sequentiallyScanned(ofHouse.scans)).not.toContain(TABLE);
            expect(ofHouse.indexes).toContain(NODE_INDEX);
            expect(readFrom(ofHouse)).toBeLessThanOrEqual(HOUSE_NODES * TAKE);
            expect(ofEntrance.indexes).toContain(NODE_INDEX);
            expect(readFrom(ofEntrance)).toBeLessThanOrEqual(TAKE);
        }
    });

    it('would read many times more rows for the same house along the list index', async () => {
        const { house, scopes } = built();

        const nodeByNode = await onNodes(scopes.house, subtreeOf(house));
        const alongTheList = await underNode(scopes.house, house.id);

        expect(readFrom(alongTheList)).toBeGreaterThan(
            readFrom(nodeByNode) * SLACK,
        );
    });

    it('reads a page from the middle of the list as cheaply as the first one', async () => {
        const { quarter, house, scopes } = built();
        const before = { createdAt: MIDDLE, id: quarter.id };

        const ofQuarter = await underNode(scopes.quarter, quarter.id, {
            before,
        });
        const ofHouse = await onNodes(scopes.house, subtreeOf(house), {
            before,
        });

        expect(ofQuarter.indexes).toContain(LIST_INDEX);
        expect(readFrom(ofQuarter)).toBeLessThanOrEqual(TAKE * SLACK);
        expect(ofHouse.indexes).toContain(NODE_INDEX);
        expect(readFrom(ofHouse)).toBeLessThanOrEqual(HOUSE_NODES * TAKE);
    });

    it('reads a page of a period from the index, starting at the end of the period', async () => {
        const { quarter, house, scopes } = built();
        const period = {
            from: new Date('2026-05-01T00:00:00.000Z'),
            to: MIDDLE,
        };

        const ofQuarter = await underNode(scopes.quarter, quarter.id, period);
        const ofHouse = await onNodes(scopes.house, subtreeOf(house), period);

        expect(ofQuarter.indexes).toContain(LIST_INDEX);
        expect(readFrom(ofQuarter)).toBeLessThanOrEqual(TAKE * SLACK);
        expect(ofHouse.indexes).toContain(NODE_INDEX);
        expect(readFrom(ofHouse)).toBeLessThanOrEqual(HOUSE_NODES * TAKE);
    });

    it('reads the entries of one person by an index, never the whole table', async () => {
        const { quarter, house, actorId, scopes } = built();
        const person = { actorAccountId: actorId };

        const ofQuarter = await underNode(scopes.quarter, quarter.id, person);
        const ofHouse = await onNodes(scopes.house, subtreeOf(house), person);

        for (const plan of [ofQuarter, ofHouse]) {
            expect(sequentiallyScanned(plan.scans)).not.toContain(TABLE);
            expect(
                plan.indexes.some((index) =>
                    [ACTOR_INDEX, LIST_INDEX, NODE_INDEX].includes(index),
                ),
            ).toBe(true);
            expect(readFrom(plan)).toBeLessThan(ENTRIES / SMALL_SHARE);
        }
    });

    it('reads the entries of one kind of action by an index, never the whole table', async () => {
        const { quarter, house, scopes } = built();
        const kind = { action: 'membership.zone_taken' };

        const ofQuarter = await underNode(scopes.quarter, quarter.id, kind);
        const ofHouse = await onNodes(scopes.house, subtreeOf(house), kind);

        for (const plan of [ofQuarter, ofHouse]) {
            expect(sequentiallyScanned(plan.scans)).not.toContain(TABLE);
            expect(readFrom(plan)).toBeLessThan(ENTRIES / SMALL_SHARE);
        }
    });

    it('counts the nodes of a small subtree along the index of ancestors, and has that path for a large one', async () => {
        const { quarter, house } = built();
        const take = SMALL_SUBTREE_NODES + 1;

        const ofHouse = await planOf(
            app().db,
            subtreeNodeIdsSql(house.id, take),
        );
        const ofQuarter = await app()
            .app.get(Transactions)
            .run(async (tx) => {
                await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
                return planOf(tx, subtreeNodeIdsSql(quarter.id, take));
            });

        expect(ofHouse.indexes).toEqual([SUBTREE_INDEX]);
        expect(rowsReadFrom(ofHouse.scans, 'node_ancestors')).toBe(HOUSE_NODES);
        expect(ofQuarter.indexes).toEqual([SUBTREE_INDEX]);
        expect(rowsReadFrom(ofQuarter.scans, 'node_ancestors')).toBe(take);
    });
});
