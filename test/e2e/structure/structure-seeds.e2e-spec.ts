import {
    TEST_HOUSE,
    TestHouseSeed,
} from '../../../src/core/structure/application/seeds/test-house.seed.ts';
import {
    TEST_QUARTER,
    TestQuarterSeed,
} from '../../../src/core/structure/application/seeds/test-quarter.seed.ts';
import { TreeReadingService } from '../../../src/core/structure/index.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { createSeedRun } from '../../utils/seed-runner.ts';

const HOUSE_NODES = 3;
const HOUSE_APARTMENTS = 76;
const QUARTER_NODES = 7;
const QUARTER_APARTMENTS = 40;
const QUARTER_HOUSES = 13;

const numbersBetween = (first: number, last: number): string[] =>
    Array.from({ length: last - first + 1 }, (_, index) =>
        String(first + index),
    );

const byNumber = (left: string, right: string): number =>
    Number.parseInt(left, 10) - Number.parseInt(right, 10) ||
    left.localeCompare(right);

describe('Seeds structure.test_house and structure.test_quarter (e2e)', () => {
    const testApp = useTestApp();

    const reading = (): TreeReadingService =>
        testApp.app.get(TreeReadingService);

    const seed = async (times: number): Promise<void> => {
        const run = await createSeedRun([TestHouseSeed, TestQuarterSeed]);
        for (let time = 0; time < times; time += 1) {
            await run.runner.run();
        }
        await run.close();
    };

    const rootIdOf = async (name: string): Promise<string> => {
        const root = await testApp.db.node.findFirstOrThrow({
            where: { name },
        });
        expect(root.complexId).toBe(root.id);
        return root.id;
    };

    const numbersIn = async (nodeId: string): Promise<string[]> => {
        const { units } = await reading().subtreeOf(nodeId);
        return units.map((unit) => unit.number).sort(byNumber);
    };

    it('creates both sets once: a second run adds no node and no unit', async () => {
        await seed(1);
        const nodes = await testApp.db.node.count();
        const ancestors = await testApp.db.nodeAncestor.count();
        const units = await testApp.db.unit.count();

        await seed(1);

        expect(nodes).toBe(HOUSE_NODES + QUARTER_NODES);
        expect(units).toBe(
            HOUSE_APARTMENTS + QUARTER_APARTMENTS + QUARTER_HOUSES,
        );
        expect(await testApp.db.node.count()).toBe(nodes);
        expect(await testApp.db.nodeAncestor.count()).toBe(ancestors);
        expect(await testApp.db.unit.count()).toBe(units);
    });

    it('builds the test house: a building with two entrances and apartments 1–38 and 39–76', async () => {
        await seed(1);

        const house = await reading().subtreeOf(
            await rootIdOf(TEST_HOUSE.name),
        );
        const [root, first, second] = house.nodes;

        expect(house.nodes.map((node) => node.kind)).toEqual([
            'building',
            'entrance',
            'entrance',
        ]);
        expect(root).toMatchObject({
            parentId: null,
            address: TEST_HOUSE.address,
        });
        expect([first?.name, second?.name]).toEqual([
            'Entrance 1',
            'Entrance 2',
        ]);
        expect(house.units).toHaveLength(HOUSE_APARTMENTS);
        expect(house.units.every((unit) => unit.type === 'apartment')).toBe(
            true,
        );
        expect(await numbersIn(first?.id ?? '')).toEqual(numbersBetween(1, 38));
        expect(await numbersIn(second?.id ?? '')).toEqual(
            numbersBetween(39, 76),
        );
    });

    it('builds the test quarter: a zone with an apartment building and a zone with a line of houses', async () => {
        await seed(1);

        const quarter = await reading().subtreeOf(
            await rootIdOf(TEST_QUARTER.name),
        );
        const zones = quarter.nodes.filter((node) => node.kind === 'zone');
        const apartmentsZone = await reading().subtreeOf(zones[0]?.id ?? '');
        const housesZone = await reading().subtreeOf(zones[1]?.id ?? '');

        expect(quarter.nodes[0]?.kind).toBe('quarter');
        expect(zones.map((zone) => zone.name)).toEqual([
            TEST_QUARTER.apartmentsZone.name,
            TEST_QUARTER.housesZone.name,
        ]);
        expect(apartmentsZone.nodes.map((node) => node.kind)).toEqual([
            'zone',
            'building',
            'entrance',
            'entrance',
        ]);
        expect(apartmentsZone.units).toHaveLength(QUARTER_APARTMENTS);
        expect(housesZone.nodes.map((node) => node.kind)).toEqual([
            'zone',
            'line',
        ]);
        expect(
            housesZone.units.map((unit) => unit.number).sort(byNumber),
        ).toEqual([...TEST_QUARTER.housesZone.line.houses]);
        expect(
            housesZone.units.every(
                (unit) => unit.type === 'house' && unit.floor === null,
            ),
        ).toBe(true);
    });
});
