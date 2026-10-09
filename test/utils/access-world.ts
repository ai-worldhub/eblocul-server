import {
    type NodeSnapshot,
    TreeBuildingService,
    TreeReadingService,
    type UnitSnapshot,
} from '../../src/core/structure/index.ts';
import { DbService } from '../../src/shared/db/db.service.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import { Ids } from '../../src/shared/ids/ids.service.ts';
import { ProbeRecords } from './access-probe.ts';
import type { ProbeApp } from './probe-app.ts';
import { type SeededTree, seedTree } from './seeded-tree.ts';

export type World = SeededTree & {
    neighbourApartment: UnitSnapshot;
    house4: NodeSnapshot;
    house4Entrance: NodeSnapshot;
    house4Apartment: UnitSnapshot;
    nodes: NodeSnapshot[];
};

const HOUSE_4 = 'Building 2';

export const buildWorld = async (
    probe: Pick<ProbeApp, 'app'>,
): Promise<World> => {
    const tree = await seedTree(probe);
    const building = probe.app.get(TreeBuildingService);
    const ids = probe.app.get(Ids);
    const added = await probe.app.get(Transactions).run(async (tx) => {
        const house4 = await building.createChild(tx, {
            id: ids.next(),
            parentId: tree.apartmentsZone.id,
            kind: 'building',
            name: HOUSE_4,
            address: null,
        });
        const house4Entrance = await building.createChild(tx, {
            id: ids.next(),
            parentId: house4.id,
            kind: 'entrance',
            name: 'Entrance 1',
            address: null,
        });
        const house4Apartment = await building.createUnit(tx, {
            id: ids.next(),
            nodeId: house4Entrance.id,
            type: 'apartment',
            number: '1',
            floor: 1,
        });
        return { house4, house4Entrance, house4Apartment };
    });
    const { units } = await probe.app
        .get(TreeReadingService)
        .subtreeOf(tree.entrance.id);
    const neighbourApartment = units.find(
        (unit) => unit.id !== tree.apartment.id,
    );
    if (neighbourApartment === undefined) {
        throw new Error('The seeded entrance has a single apartment');
    }
    const nodes = [
        tree.quarter,
        tree.apartmentsZone,
        tree.building,
        tree.entrance,
        added.house4,
        added.house4Entrance,
        tree.housesZone,
        tree.line,
        tree.house,
        tree.houseEntrance,
    ];
    const records = probe.app.get(ProbeRecords);
    const db = probe.app.get(DbService);
    for (const node of nodes) {
        await records.add(db, {
            complexId: node.complexId,
            ownerNodeId: node.id,
            title: `record of ${node.name}`,
        });
    }
    return { ...tree, ...added, neighbourApartment, nodes };
};
