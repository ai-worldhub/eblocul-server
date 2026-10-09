import {
    type NodeKind,
    type NodeSnapshot,
    TEST_HOUSE,
    TEST_QUARTER,
    TestHouseSeed,
    TestQuarterSeed,
    TreeReadingService,
    type UnitSnapshot,
} from '../../src/core/structure/index.ts';
import { createSeedRun } from './seed-runner.ts';
import type { TestApp } from './test-app.factory.ts';

export type SeededTree = {
    house: NodeSnapshot;
    houseEntrance: NodeSnapshot;
    houseApartment: UnitSnapshot;
    quarter: NodeSnapshot;
    apartmentsZone: NodeSnapshot;
    building: NodeSnapshot;
    entrance: NodeSnapshot;
    apartment: UnitSnapshot;
    housesZone: NodeSnapshot;
    line: NodeSnapshot;
    privateHouse: UnitSnapshot;
};

const nodeOf = (
    nodes: NodeSnapshot[],
    kind: NodeKind,
    name?: string,
): NodeSnapshot => {
    const node = nodes.find(
        (candidate) =>
            candidate.kind === kind &&
            (name === undefined || candidate.name === name),
    );
    if (node === undefined) {
        throw new Error(`The seeded tree has no ${kind} ${name ?? ''}`);
    }
    return node;
};

const unitOf = (units: UnitSnapshot[], nodeId: string): UnitSnapshot => {
    const unit = units.find((candidate) => candidate.nodeId === nodeId);
    if (unit === undefined) {
        throw new Error(`The seeded tree has no unit on node ${nodeId}`);
    }
    return unit;
};

export const seedTree = async (
    testApp: Pick<TestApp, 'app'>,
): Promise<SeededTree> => {
    const run = await createSeedRun([TestHouseSeed, TestQuarterSeed]);
    await run.runner.run();
    await run.close();

    const reading = testApp.app.get(TreeReadingService);
    const houseId = await reading.rootIdByName(TEST_HOUSE.name);
    const quarterId = await reading.rootIdByName(TEST_QUARTER.name);
    if (houseId === null || quarterId === null) {
        throw new Error('The structure seeds created no roots');
    }
    const house = await reading.subtreeOf(houseId);
    const quarter = await reading.subtreeOf(quarterId);
    const houseEntrance = nodeOf(house.nodes, 'entrance');
    const entrance = nodeOf(quarter.nodes, 'entrance');
    const line = nodeOf(quarter.nodes, 'line');

    return {
        house: nodeOf(house.nodes, 'building'),
        houseEntrance,
        houseApartment: unitOf(house.units, houseEntrance.id),
        quarter: nodeOf(quarter.nodes, 'quarter'),
        apartmentsZone: nodeOf(
            quarter.nodes,
            'zone',
            TEST_QUARTER.apartmentsZone.name,
        ),
        building: nodeOf(quarter.nodes, 'building'),
        entrance,
        apartment: unitOf(quarter.units, entrance.id),
        housesZone: nodeOf(quarter.nodes, 'zone', TEST_QUARTER.housesZone.name),
        line,
        privateHouse: unitOf(quarter.units, line.id),
    };
};
