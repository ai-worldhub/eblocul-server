import {
    type AccessAction,
    type AccessScope,
    AccessService,
} from '../../../src/core/authz/index.ts';
import { scopeOf } from '../../../src/core/authz/domain/entities/access-scope.ts';
import {
    grantSql,
    targetSql,
} from '../../../src/core/authz/infrastructure/prisma/access-queries.ts';
import {
    scopeCondition,
    scopeNodeWhere,
} from '../../../src/core/authz/infrastructure/prisma/scope-condition.ts';
import type { SessionApplication } from '../../../src/core/identity/index.ts';
import { Prisma } from '../../../src/generated/prisma/client.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { accountRow } from '../../factories/identity.factory.ts';
import { unitRow } from '../../factories/structure.factory.ts';
import {
    CHANGE_RECORDS,
    HANDLE_REQUESTS,
    READ_RECORDS,
    READ_SETTINGS,
    recordsSql,
    setUpProbeRecords,
    tearDownProbeRecords,
} from '../../utils/access-probe.ts';
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
const CREATED_AT = new Date('2026-10-01T09:00:00.000Z');
const BIG = { zones: 4, buildings: 10, entrances: 5 };
const SMALL = { zones: 2, buildings: 3, entrances: 2 };
const SMALL_COMPLEXES = 20;
const BIG_RECORDS_PER_NODE = 800;
const SMALL_RECORDS_PER_NODE = 200;
const UNITS_PER_ENTRANCE = 4;
const RESIDENTS = 200;
const INSERT_BATCH = 2000;
const RECORDS =
    BIG_RECORDS_PER_NODE * 245 + SMALL_RECORDS_PER_NODE * 21 * SMALL_COMPLEXES;
const SMALL_SHARE = 10;
const LIST_INDEX = 'records_complex_id_created_at_id_idx';
const RECORD_INDEXES = [
    LIST_INDEX,
    'records_owner_node_id_idx',
    'records_complex_id_owner_node_id_idx',
];
const TREE_INDEXES = [
    'node_ancestors_pkey',
    'node_ancestors_ancestor_id_node_id_idx',
];
const SMALL_TABLES = ['node_assignments', 'unit_memberships'];

type Shape = { zones: number; buildings: number; entrances: number };

type Building = { id: string; entranceIds: string[] };
type Zone = { id: string; buildings: Building[] };
type Complex = { id: string; zones: Zone[] };

type NodeRow = Prisma.NodeCreateManyInput;
type AncestorRow = Prisma.NodeAncestorCreateManyInput;

type GrantKey = { grantId: string; accountId: string };

type ScopeName =
    | 'zone'
    | 'house'
    | 'houseAndAbove'
    | 'quarter'
    | 'chiefChanges'
    | 'chiefRequests'
    | 'chain';

type Data = {
    big: Complex;
    unitId: string;
    entranceId: string;
    scopes: Record<ScopeName, AccessScope>;
    grants: Record<'zoneAdmin' | 'houseAdmin' | 'chief' | 'resident', GrantKey>;
};

const ZONE_NODES = 1 + BIG.buildings + BIG.buildings * BIG.entrances;
const QUARTER_NODES = 1 + BIG.zones * ZONE_NODES;
const BUILDING_NODES = 1 + BIG.entrances;
const CHAIN_NODES = 4;
const NODES_ABOVE_BUILDING = 2;
const TAKEN_ZONES = 2;

describe('Access scope on a database with many complexes (e2e)', () => {
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
        const add = (
            kind: NodeRow['kind'],
            complexId: string | null,
            lineage: string[],
        ): string => {
            const id = ids.next();
            nodes.push({
                id,
                complexId: complexId ?? id,
                kind,
                name: `${name} ${kind} ${nodes.length}`,
                address: null,
                createdAt: CREATED_AT,
            });
            [id, ...lineage].forEach((ancestorId, depth) => {
                ancestors.push({ nodeId: id, ancestorId, depth });
            });
            return id;
        };
        const quarterId = add('quarter', null, []);
        const zones = Array.from({ length: shape.zones }, () => {
            const zoneId = add('zone', quarterId, [quarterId]);
            const buildings = Array.from({ length: shape.buildings }, () => {
                const buildingId = add('building', quarterId, [
                    zoneId,
                    quarterId,
                ]);
                const entranceIds = Array.from(
                    { length: shape.entrances },
                    () =>
                        add('entrance', quarterId, [
                            buildingId,
                            zoneId,
                            quarterId,
                        ]),
                );
                return { id: buildingId, entranceIds };
            });
            return { id: zoneId, buildings };
        });
        return { id: quarterId, zones };
    };

    const insertTree = async (
        nodes: NodeRow[],
        ancestors: AncestorRow[],
    ): Promise<void> => {
        const roots = nodes.filter((node) => node.id === node.complexId);
        const others = nodes.filter((node) => node.id !== node.complexId);
        await app().db.node.createMany({ data: roots });
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

    const scopeFor = async (
        grant: { grantId: string; accountId: string },
        action: AccessAction,
        application: SessionApplication = 'admin_panel',
    ): Promise<AccessScope> => {
        const access = await app().app.get(AccessService).open(
            {
                sessionId: grant.accountId,
                accountId: grant.accountId,
                application,
            },
            { grantId: grant.grantId, action },
        );
        return access.scope;
    };

    const build = async (): Promise<Data> => {
        const setup = membershipSetupOf(app());
        const nodes: NodeRow[] = [];
        const ancestors: AncestorRow[] = [];
        const big = complexOf(BIG, 'Big', nodes, ancestors);
        const small = Array.from({ length: SMALL_COMPLEXES }, (_, index) =>
            complexOf(SMALL, `Small ${index}`, nodes, ancestors),
        );
        await insertTree(nodes, ancestors);

        const [zone1, zone2, zone3, zone4] = big.zones;
        const building = zone1?.buildings[0];
        const entranceId = building?.entranceIds[0];
        if (
            zone1 === undefined ||
            zone2 === undefined ||
            zone3 === undefined ||
            zone4 === undefined ||
            building === undefined ||
            entranceId === undefined
        ) {
            throw new Error('The big quarter is not built');
        }
        const units = big.zones.flatMap((zone) =>
            zone.buildings.flatMap((house) =>
                house.entranceIds.flatMap((nodeId) =>
                    unitRow.buildMany(UNITS_PER_ENTRANCE, () => ({
                        complexId: big.id,
                        nodeId,
                    })),
                ),
            ),
        );
        const unit = units.find((row) => row.nodeId === entranceId);
        if (unit === undefined) {
            throw new Error('The entrance has no unit');
        }
        await app().db.unit.createMany({ data: units });
        const neighbours = accountRow.buildMany(RESIDENTS);
        await app().db.account.createMany({ data: neighbours });
        await app().db.unitMembership.createMany({
            data: neighbours.map((neighbour, index) => ({
                id: app().app.get(Ids).next(),
                accountId: neighbour.id,
                unitId: units[units.length - 1 - index]?.id ?? unit.id,
                role: 'tenant' as const,
                startedAt: CREATED_AT,
                endedAt: null,
            })),
        });

        await app().db.$executeRaw`
            INSERT INTO authz_probe.records
                (id, complex_id, owner_node_id, title, created_at)
            SELECT
                gen_random_uuid(),
                n.complex_id,
                n.id,
                'record',
                ${CREATED_AT}::timestamptz - random() * interval '200 days'
            FROM structure.nodes n
            CROSS JOIN LATERAL generate_series(
                1,
                CASE
                    WHEN n.complex_id = ${big.id}::uuid
                        THEN ${BIG_RECORDS_PER_NODE}::int
                    ELSE ${SMALL_RECORDS_PER_NODE}::int
                END
            )
        `;

        const account = async (): Promise<string> => setup.addAccount();
        const zoneAdminId = await account();
        const otherZoneAdminId = await account();
        const houseAdminId = await account();
        const chiefId = await account();
        const residentId = await account();
        const zoneAdmin = await setup.assign(
            zoneAdminId,
            zone1.id,
            'administrator',
        );
        await setup.assign(otherZoneAdminId, zone3.id, 'administrator');
        const houseAdmin = await setup.assign(
            houseAdminId,
            building.id,
            'administrator',
        );
        const chief = await setup.assign(
            chiefId,
            big.id,
            'chief_administrator',
        );
        await setup.takeZone(chiefId, zone2.id);
        await setup.takeZone(chiefId, zone4.id);
        const resident = await setup.bind(residentId, unit.id, 'owner');
        for (const complex of small) {
            for (const zone of complex.zones) {
                await setup.assign(await account(), zone.id, 'administrator');
            }
        }
        await app().db.$executeRaw`
            ANALYZE structure.nodes, structure.node_ancestors,
                structure.units, membership.node_assignments,
                membership.unit_memberships, authz_probe.records
        `;

        const grants = {
            zoneAdmin: { grantId: zoneAdmin.id, accountId: zoneAdminId },
            houseAdmin: { grantId: houseAdmin.id, accountId: houseAdminId },
            chief: { grantId: chief.id, accountId: chiefId },
            resident: { grantId: resident.id, accountId: residentId },
        };
        return {
            big,
            unitId: unit.id,
            entranceId,
            grants,
            scopes: {
                zone: await scopeFor(grants.zoneAdmin, READ_RECORDS),
                house: await scopeFor(grants.houseAdmin, READ_RECORDS),
                houseAndAbove: await scopeFor(grants.houseAdmin, READ_SETTINGS),
                quarter: await scopeFor(grants.chief, READ_RECORDS),
                chiefChanges: await scopeFor(grants.chief, CHANGE_RECORDS),
                chiefRequests: await scopeFor(grants.chief, HANDLE_REQUESTS),
                chain: await scopeFor(
                    grants.resident,
                    READ_RECORDS,
                    'resident_app',
                ),
            },
        };
    };

    beforeAll(async () => {
        testApp = await createTestApp();
        await cleanDatabase(testApp.db);
        await setUpProbeRecords(testApp.db);
        data = await build();
    }, BUILD_TIMEOUT_MS);

    afterAll(async () => {
        if (testApp !== undefined) {
            await tearDownProbeRecords(testApp.db);
            await cleanDatabase(testApp.db);
            await testApp.app.close();
        }
    });

    const plansOf = async (
        names: readonly ScopeName[],
    ): Promise<[ScopeName, QueryPlan][]> => {
        const plans: [ScopeName, QueryPlan][] = [];
        for (const name of names) {
            plans.push([
                name,
                await planOf(app().db, recordsSql(built().scopes[name])),
            ]);
        }
        return plans;
    };

    const withoutSequentialScans = (query: Prisma.Sql): Promise<QueryPlan> =>
        app()
            .app.get(Transactions)
            .run(async (tx) => {
                await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
                return planOf(tx, query);
            });

    const nodeIdsBySql = async (scope: AccessScope): Promise<string[]> => {
        const rows = await app().db.$queryRaw<{ id: string }[]>`
            SELECT n.id
            FROM structure.nodes n
            WHERE ${scopeCondition(scope, {
                complexId: Prisma.sql`n.complex_id`,
                ownerNodeId: Prisma.sql`n.id`,
            })}
        `;
        return rows.map((row) => row.id).sort();
    };

    const nodeIdsByWhere = async (scope: AccessScope): Promise<string[]> => {
        const rows = await app().db.node.findMany({
            where: scopeNodeWhere(scope),
            select: { id: true },
        });
        return rows.map((row) => row.id).sort();
    };

    it('holds many complexes: every scope names the nodes of its own complex only, in SQL and in a Prisma where alike', async () => {
        const { scopes, big } = built();
        const counted: Partial<Record<ScopeName, number>> = {};

        for (const name of Object.keys(scopes) as ScopeName[]) {
            const bySql = await nodeIdsBySql(scopes[name]);
            const inBigQuarter = await app().db.node.count({
                where: { id: { in: bySql }, complexId: big.id },
            });

            expect(await nodeIdsByWhere(scopes[name])).toEqual(bySql);
            expect(inBigQuarter).toBe(bySql.length);
            counted[name] = bySql.length;
        }

        expect(await app().db.node.count()).toBe(
            QUARTER_NODES + SMALL_COMPLEXES * 21,
        );
        expect(counted).toEqual({
            zone: ZONE_NODES,
            house: BUILDING_NODES,
            houseAndAbove: BUILDING_NODES + NODES_ABOVE_BUILDING,
            quarter: QUARTER_NODES,
            chiefChanges: 1 + TAKEN_ZONES * ZONE_NODES,
            chiefRequests: 1 + TAKEN_ZONES * ZONE_NODES,
            chain: CHAIN_NODES,
        });
    });

    it('names no node when the scope is empty', async () => {
        const nowhere = scopeOf({
            complexId: built().big.id,
            subtreeRootIds: [],
            nodeIds: [],
            withUnadministeredNodes: false,
        });

        expect(await nodeIdsBySql(nowhere)).toEqual([]);
        expect(await nodeIdsByWhere(nowhere)).toEqual([]);
    });

    it('reads the first page of a large perimeter along the list index and the tree along its indexes', async () => {
        for (const [name, plan] of await plansOf(['zone', 'quarter'])) {
            expect(sequentiallyScanned(plan.scans), name).toEqual([]);
            expect(plan.indexes, name).toContain(LIST_INDEX);
            expect(
                plan.indexes.some((index) => TREE_INDEXES.includes(index)),
                name,
            ).toBe(true);
            expect(rowsReadFrom(plan.scans, 'records'), name).toBeLessThan(
                RECORDS / SMALL_SHARE,
            );
        }
    });

    it('reads the first page of a small or a mixed perimeter by an index of the table, never the whole table', async () => {
        for (const [name, plan] of await plansOf([
            'house',
            'houseAndAbove',
            'chain',
            'chiefChanges',
        ])) {
            expect(sequentiallyScanned(plan.scans), name).toEqual([]);
            expect(
                plan.indexes.some((index) => RECORD_INDEXES.includes(index)),
                name,
            ).toBe(true);
            expect(rowsReadFrom(plan.scans, 'records'), name).toBeLessThan(
                RECORDS / SMALL_SHARE,
            );
        }
    });

    it('keeps the list of the chief on the list index when the scope is "nodes without an administrator", and has an index path for every table of that condition', async () => {
        const query = recordsSql(built().scopes.chiefRequests);

        const usual = await planOf(app().db, query);
        const forced = await withoutSequentialScans(query);

        expect(sequentiallyScanned(usual.scans)).not.toContain('records');
        expect(usual.indexes).toContain(LIST_INDEX);
        expect(rowsReadFrom(usual.scans, 'records')).toBeLessThan(
            RECORDS / SMALL_SHARE,
        );
        expect(sequentiallyScanned(forced.scans)).toEqual([]);
        expect(forced.indexes).toEqual(
            expect.arrayContaining([
                LIST_INDEX,
                'node_assignments_node_id_idx',
            ]),
        );
        expect(
            forced.indexes.some((index) => TREE_INDEXES.includes(index)),
        ).toBe(true);
    });

    it('checks a perimeter by the primary keys of the tree: one node and its lineage', async () => {
        const { big, unitId, entranceId } = built();
        const node = await planOf(
            app().db,
            targetSql({ kind: 'node', nodeId: entranceId }),
        );
        const unit = await planOf(
            app().db,
            targetSql({ kind: 'unit', unitId }),
        );
        const forced = await withoutSequentialScans(
            targetSql({ kind: 'unit', unitId }),
        );

        for (const plan of [node, unit]) {
            expect(
                sequentiallyScanned(plan.scans).filter(
                    (table) => !SMALL_TABLES.includes(table),
                ),
            ).toEqual([]);
            expect(plan.indexes).toEqual(
                expect.arrayContaining(['nodes_pkey', 'node_ancestors_pkey']),
            );
            expect(rowsReadFrom(plan.scans, 'nodes')).toBe(1);
            expect(rowsReadFrom(plan.scans, 'node_ancestors')).toBe(
                2 * CHAIN_NODES,
            );
        }
        expect(unit.indexes).toContain('units_pkey');
        expect(sequentiallyScanned(forced.scans)).toEqual([]);
        expect(forced.indexes).toContain('node_assignments_node_id_idx');
        expect(big.zones).toHaveLength(BIG.zones);
    });

    it('loads a grant by primary keys and has an index path for the small tables of membership', async () => {
        const { grants } = built();

        for (const key of [grants.chief, grants.zoneAdmin, grants.resident]) {
            const usual = await planOf(app().db, grantSql(key));
            const forced = await withoutSequentialScans(grantSql(key));

            expect(
                sequentiallyScanned(usual.scans).filter(
                    (table) => !SMALL_TABLES.includes(table),
                ),
            ).toEqual([]);
            expect(sequentiallyScanned(forced.scans)).toEqual([]);
            for (const table of SMALL_TABLES) {
                expect(
                    forced.indexes.some((index) => index.startsWith(table)),
                    table,
                ).toBe(true);
            }
        }
    });
});
