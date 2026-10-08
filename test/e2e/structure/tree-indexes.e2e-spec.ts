import {
    type NodeKind,
    TreeBuildingService,
    TreeReadingService,
} from '../../../src/core/structure/index.ts';
import {
    chainOfUnitSql,
    subtreeSql,
} from '../../../src/core/structure/infrastructure/prisma/tree-queries.ts';
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import type { Tx } from '../../../src/shared/db/tx.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { unitRow } from '../../factories/structure.factory.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    rowsReadFrom,
    sequentiallyScanned,
    type TableScan,
    tableScansOf,
} from '../../utils/query-plan.ts';

const ZONES = 4;
const BUILDINGS_PER_ZONE = 10;
const ENTRANCES_PER_BUILDING = 5;
const APARTMENTS_PER_ENTRANCE = 50;
const APARTMENTS_PER_BUILDING =
    ENTRANCES_PER_BUILDING * APARTMENTS_PER_ENTRANCE;
const APARTMENTS_PER_ZONE = BUILDINGS_PER_ZONE * APARTMENTS_PER_BUILDING;
const APARTMENTS = ZONES * APARTMENTS_PER_ZONE;
const NODES_PER_ZONE =
    1 + BUILDINGS_PER_ZONE + BUILDINGS_PER_ZONE * ENTRANCES_PER_BUILDING;
const CHAIN_LENGTH = 4;
const INSERT_BATCH = 2000;
const BUILD_TIMEOUT_MS = 60_000;
const ROUNDING_SHARE = 0.05;

type Quarter = {
    zoneId: string;
    buildingId: string;
    entranceId: string;
    apartmentId: string;
};

describe('Structure tree on ten thousand units (e2e)', () => {
    const testApp = useTestApp();
    let quarter: Quarter | undefined;

    const transactions = (): Transactions => testApp.app.get(Transactions);
    const reading = (): TreeReadingService =>
        testApp.app.get(TreeReadingService);

    const built = (): Quarter => {
        if (quarter === undefined) {
            throw new Error('The quarter is not built yet');
        }
        return quarter;
    };

    const addChild = async (
        tx: Tx,
        parentId: string,
        kind: NodeKind,
    ): Promise<string> => {
        const node = await testApp.app
            .get(TreeBuildingService)
            .createChild(tx, {
                id: testApp.app.get(Ids).next(),
                parentId,
                kind,
                name: `Test ${kind}`,
                address: null,
            });
        return node.id;
    };

    const addZone = (rootId: string): Promise<string[][]> =>
        transactions().run(async (tx) => {
            const zoneId = await addChild(tx, rootId, 'zone');
            const buildings: string[][] = [];
            for (let house = 0; house < BUILDINGS_PER_ZONE; house += 1) {
                const buildingId = await addChild(tx, zoneId, 'building');
                const entrances: string[] = [];
                for (let door = 0; door < ENTRANCES_PER_BUILDING; door += 1) {
                    entrances.push(await addChild(tx, buildingId, 'entrance'));
                }
                buildings.push([zoneId, buildingId, ...entrances]);
            }
            return buildings;
        });

    const buildQuarter = async (): Promise<Quarter> => {
        const root = await transactions().run((tx) =>
            testApp.app.get(TreeBuildingService).createRoot(tx, {
                id: testApp.app.get(Ids).next(),
                kind: 'quarter',
                name: 'Test Quarter',
                address: null,
            }),
        );
        const buildings: string[][] = [];
        for (let zone = 0; zone < ZONES; zone += 1) {
            buildings.push(...(await addZone(root.id)));
        }
        const rows = buildings.flatMap(([, , ...entrances]) =>
            entrances.flatMap((nodeId) =>
                unitRow.buildMany(APARTMENTS_PER_ENTRANCE, () => ({
                    complexId: root.id,
                    nodeId,
                })),
            ),
        );
        for (let from = 0; from < rows.length; from += INSERT_BATCH) {
            await testApp.db.unit.createMany({
                data: rows.slice(from, from + INSERT_BATCH),
            });
        }
        await testApp.db.$executeRaw`
            ANALYZE structure.nodes, structure.node_ancestors, structure.units
        `;
        const [zoneId = '', buildingId = '', , entranceId = ''] =
            buildings[BUILDINGS_PER_ZONE + 1] ?? [];
        const apartment = rows.find((row) => row.nodeId === entranceId);
        return {
            zoneId,
            buildingId,
            entranceId,
            apartmentId: apartment?.id ?? '',
        };
    };

    const withoutSequentialScans = (query: Prisma.Sql): Promise<TableScan[]> =>
        transactions().run(async (tx) => {
            await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
            return tableScansOf(tx, query);
        });

    const expectAbout = (actual: number, expected: number): void => {
        expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
            expected * ROUNDING_SHARE,
        );
    };

    beforeEach(async () => {
        quarter = await buildQuarter();
    }, BUILD_TIMEOUT_MS);

    it('holds ten thousand units and still answers both questions', async () => {
        const { apartmentId, zoneId } = built();

        const chain = await reading().chainOfUnit(apartmentId);
        const subtree = await reading().subtreeOf(zoneId);

        expect(await testApp.db.unit.count()).toBe(APARTMENTS);
        expect(chain.nodes.map((node) => node.kind)).toEqual([
            'quarter',
            'zone',
            'building',
            'entrance',
        ]);
        expect(subtree.nodes).toHaveLength(NODES_PER_ZONE);
        expect(subtree.units).toHaveLength(APARTMENTS_PER_ZONE);
    });

    it('reads the chain of a unit through indexes and touches only the chain', async () => {
        const scans = await tableScansOf(
            testApp.db,
            chainOfUnitSql(built().apartmentId),
        );

        expect(sequentiallyScanned(scans)).toEqual([]);
        expect(rowsReadFrom(scans, 'units')).toBe(1);
        expect(rowsReadFrom(scans, 'node_ancestors')).toBe(CHAIN_LENGTH);
        expect(rowsReadFrom(scans, 'nodes')).toBe(CHAIN_LENGTH);
    });

    it('reads the subtree of an entrance without scanning all units or all ancestor rows', async () => {
        const scans = await tableScansOf(
            testApp.db,
            subtreeSql(built().entranceId),
        );

        expect(sequentiallyScanned(scans)).not.toContain('units');
        expect(sequentiallyScanned(scans)).not.toContain('node_ancestors');
        expect(rowsReadFrom(scans, 'units')).toBe(APARTMENTS_PER_ENTRANCE);
    });

    it('has an index path for every table of a larger subtree and reads only the units of that subtree', async () => {
        const { buildingId, zoneId } = built();

        const ofBuilding = await withoutSequentialScans(subtreeSql(buildingId));
        const ofZone = await withoutSequentialScans(subtreeSql(zoneId));

        expect(sequentiallyScanned(ofBuilding)).toEqual([]);
        expect(sequentiallyScanned(ofZone)).toEqual([]);
        expectAbout(rowsReadFrom(ofBuilding, 'units'), APARTMENTS_PER_BUILDING);
        expectAbout(rowsReadFrom(ofZone, 'units'), APARTMENTS_PER_ZONE);
    });
});
