import {
    type NewChild,
    type NewUnit,
    type NodeKind,
    type NodeSnapshot,
    TreeBuildingService,
    TreeReadingService,
    type UnitSnapshot,
    type UnitType,
} from '../../../src/core/structure/index.ts';
import { StructureError } from '../../../src/core/structure/domain/structure.errors.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';

const NOW = new Date('2026-10-08T09:00:00.000Z');
const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';

type House = {
    house: NodeSnapshot;
    firstEntrance: NodeSnapshot;
    secondEntrance: NodeSnapshot;
    apartment7: UnitSnapshot;
    apartment45: UnitSnapshot;
};

type Quarter = {
    quarter: NodeSnapshot;
    apartmentsZone: NodeSnapshot;
    building: NodeSnapshot;
    entrance: NodeSnapshot;
    apartment: UnitSnapshot;
    housesZone: NodeSnapshot;
    line: NodeSnapshot;
    privateHouse: UnitSnapshot;
};

const refusalOf = async (
    work: Promise<unknown>,
): Promise<{ code: unknown; details: unknown }> => {
    const refusal: unknown = await work.then(
        () => null,
        (error: unknown) => error,
    );
    if (!(refusal instanceof StructureError)) {
        throw new Error('The work was not refused by the structure module');
    }
    return { code: refusal.code, details: refusal.details };
};

const idsOf = (items: { id: string }[]): string[] =>
    items.map((item) => item.id).sort();

describe('Structure tree (e2e)', () => {
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(new ClockDouble(NOW)),
    );

    const transactions = (): Transactions => testApp.app.get(Transactions);
    const building = (): TreeBuildingService =>
        testApp.app.get(TreeBuildingService);
    const reading = (): TreeReadingService =>
        testApp.app.get(TreeReadingService);
    const nextId = (): string => testApp.app.get(Ids).next();

    const addRoot = (kind: NodeKind, name: string): Promise<NodeSnapshot> =>
        transactions().run((tx) =>
            building().createRoot(tx, {
                id: nextId(),
                kind,
                name,
                address: '1 Example Street',
            }),
        );

    const addChild = (
        parentId: string,
        kind: NodeKind,
        name: string,
        overrides: Partial<NewChild> = {},
    ): Promise<NodeSnapshot> =>
        transactions().run((tx) =>
            building().createChild(tx, {
                id: nextId(),
                parentId,
                kind,
                name,
                address: null,
                ...overrides,
            }),
        );

    const addUnit = (
        nodeId: string,
        type: UnitType,
        number: string,
        overrides: Partial<NewUnit> = {},
    ): Promise<UnitSnapshot> =>
        transactions().run((tx) =>
            building().createUnit(tx, {
                id: nextId(),
                nodeId,
                type,
                number,
                floor: null,
                ...overrides,
            }),
        );

    const addHouse = async (): Promise<House> => {
        const house = await addRoot('building', 'Test House');
        const firstEntrance = await addChild(
            house.id,
            'entrance',
            'Entrance 1',
        );
        const secondEntrance = await addChild(
            house.id,
            'entrance',
            'Entrance 2',
        );
        const apartment7 = await addUnit(firstEntrance.id, 'apartment', '7', {
            floor: 2,
        });
        const apartment45 = await addUnit(secondEntrance.id, 'apartment', '45');
        return {
            house,
            firstEntrance,
            secondEntrance,
            apartment7,
            apartment45,
        };
    };

    const addQuarter = async (): Promise<Quarter> => {
        const quarter = await addRoot('quarter', 'Test Quarter');
        const apartmentsZone = await addChild(
            quarter.id,
            'zone',
            'Test Zone Apartments',
        );
        const house = await addChild(
            apartmentsZone.id,
            'building',
            'Building 1',
        );
        const entrance = await addChild(house.id, 'entrance', 'Entrance 1');
        const apartment = await addUnit(entrance.id, 'apartment', '3');
        const housesZone = await addChild(
            quarter.id,
            'zone',
            'Test Zone Houses',
        );
        const line = await addChild(housesZone.id, 'line', 'Line A');
        const privateHouse = await addUnit(line.id, 'house', '12A');
        return {
            quarter,
            apartmentsZone,
            building: house,
            entrance,
            apartment,
            housesZone,
            line,
            privateHouse,
        };
    };

    describe('a single house', () => {
        it('gives an apartment a chain of three links: house, entrance, apartment', async () => {
            const { house, secondEntrance, apartment45 } = await addHouse();

            const chain = await reading().chainOfUnit(apartment45.id);

            expect(chain).toEqual({
                nodes: [house, secondEntrance],
                unit: apartment45,
            });
            expect(chain.nodes.map((node) => node.kind)).toEqual([
                'building',
                'entrance',
            ]);
            expect(chain.unit.type).toBe('apartment');
        });

        it('stores what was given and takes the time from the clock', async () => {
            const { house, firstEntrance, apartment7 } = await addHouse();

            expect(house).toEqual({
                id: house.id,
                complexId: house.id,
                parentId: null,
                kind: 'building',
                name: 'Test House',
                address: '1 Example Street',
                createdAt: NOW,
            });
            expect(firstEntrance).toMatchObject({
                complexId: house.id,
                parentId: house.id,
                kind: 'entrance',
                address: null,
            });
            expect(apartment7).toEqual({
                id: apartment7.id,
                complexId: house.id,
                nodeId: firstEntrance.id,
                type: 'apartment',
                number: '7',
                floor: 2,
                createdAt: NOW,
            });
        });

        it('returns the whole house as the subtree of its root', async () => {
            const created = await addHouse();

            const subtree = await reading().subtreeOf(created.house.id);

            expect(subtree.nodes[0]).toEqual(created.house);
            expect(idsOf(subtree.nodes)).toEqual(
                idsOf([
                    created.house,
                    created.firstEntrance,
                    created.secondEntrance,
                ]),
            );
            expect(idsOf(subtree.units)).toEqual(
                idsOf([created.apartment7, created.apartment45]),
            );
        });

        it('returns one entrance with its apartments only', async () => {
            const { firstEntrance, apartment7 } = await addHouse();

            const subtree = await reading().subtreeOf(firstEntrance.id);

            expect(subtree).toEqual({
                nodes: [firstEntrance],
                units: [apartment7],
            });
        });

        it('writes for every node a row per ancestor, itself included', async () => {
            const { house, firstEntrance } = await addHouse();

            const rows = await testApp.db.nodeAncestor.findMany({
                where: { nodeId: { in: [house.id, firstEntrance.id] } },
                orderBy: [{ nodeId: 'asc' }, { depth: 'asc' }],
            });

            expect(rows).toEqual([
                { nodeId: house.id, ancestorId: house.id, depth: 0 },
                {
                    nodeId: firstEntrance.id,
                    ancestorId: firstEntrance.id,
                    depth: 0,
                },
                { nodeId: firstEntrance.id, ancestorId: house.id, depth: 1 },
            ]);
        });
    });

    describe('a quarter', () => {
        it('gives an apartment the chain from the quarter down to the entrance', async () => {
            const created = await addQuarter();

            const chain = await reading().chainOfUnit(created.apartment.id);

            expect(chain).toEqual({
                nodes: [
                    created.quarter,
                    created.apartmentsZone,
                    created.building,
                    created.entrance,
                ],
                unit: created.apartment,
            });
        });

        it('gives a private house on a line a chain without an entrance', async () => {
            const created = await addQuarter();

            const chain = await reading().chainOfUnit(created.privateHouse.id);

            expect(chain).toEqual({
                nodes: [created.quarter, created.housesZone, created.line],
                unit: created.privateHouse,
            });
            expect(chain.nodes.map((node) => node.kind)).not.toContain(
                'entrance',
            );
            expect(chain.unit).toMatchObject({
                type: 'house',
                number: '12A',
                floor: null,
            });
        });

        it('returns every node and unit as the subtree of the quarter, the upper levels first', async () => {
            const created = await addQuarter();

            const subtree = await reading().subtreeOf(created.quarter.id);

            expect(subtree.nodes.map((node) => node.kind)).toEqual([
                'quarter',
                'zone',
                'zone',
                'building',
                'line',
                'entrance',
            ]);
            expect(idsOf(subtree.nodes)).toEqual(
                idsOf([
                    created.quarter,
                    created.apartmentsZone,
                    created.building,
                    created.entrance,
                    created.housesZone,
                    created.line,
                ]),
            );
            expect(idsOf(subtree.units)).toEqual(
                idsOf([created.apartment, created.privateHouse]),
            );
        });

        it('keeps the nodes and units of the neighbouring zone out of a zone subtree', async () => {
            const created = await addQuarter();

            const apartments = await reading().subtreeOf(
                created.apartmentsZone.id,
            );
            const houses = await reading().subtreeOf(created.housesZone.id);

            expect(apartments).toEqual({
                nodes: [
                    created.apartmentsZone,
                    created.building,
                    created.entrance,
                ],
                units: [created.apartment],
            });
            expect(houses).toEqual({
                nodes: [created.housesZone, created.line],
                units: [created.privateHouse],
            });
        });

        it('keeps another complex out of the subtree of a root', async () => {
            const created = await addQuarter();
            const other = await addHouse();

            const subtree = await reading().subtreeOf(created.quarter.id);

            expect(idsOf(subtree.nodes)).not.toContain(other.house.id);
            expect(idsOf(subtree.units)).not.toContain(other.apartment7.id);
            expect(
                subtree.nodes.every(
                    (node) => node.complexId === created.quarter.id,
                ),
            ).toBe(true);
            expect(
                subtree.units.every(
                    (unit) => unit.complexId === created.quarter.id,
                ),
            ).toBe(true);
        });
    });

    describe('a repeated request', () => {
        const counts = async (): Promise<number[]> => [
            await testApp.db.node.count(),
            await testApp.db.nodeAncestor.count(),
            await testApp.db.unit.count(),
        ];

        it('returns the root, the node and the unit created before and adds nothing', async () => {
            const { house, firstEntrance, apartment7 } = await addHouse();
            const before = await counts();

            const root = await transactions().run((tx) =>
                building().createRoot(tx, {
                    id: house.id,
                    kind: 'building',
                    name: 'Another Name',
                    address: null,
                }),
            );
            const entrance = await addChild(house.id, 'entrance', 'Renamed', {
                id: firstEntrance.id,
            });
            const apartment = await addUnit(
                firstEntrance.id,
                'apartment',
                '700',
                { id: apartment7.id },
            );

            expect(root).toEqual(house);
            expect(entrance).toEqual(firstEntrance);
            expect(apartment).toEqual(apartment7);
            expect(await counts()).toEqual(before);
        });

        it('keeps the transaction of the caller usable after a repeat', async () => {
            const { firstEntrance, apartment7 } = await addHouse();

            const added = await transactions().run(async (tx) => {
                await building().createUnit(tx, {
                    id: apartment7.id,
                    nodeId: firstEntrance.id,
                    type: 'apartment',
                    number: '7',
                    floor: 2,
                });
                return building().createUnit(tx, {
                    id: nextId(),
                    nodeId: firstEntrance.id,
                    type: 'apartment',
                    number: '8',
                    floor: 2,
                });
            });

            expect(added.number).toBe('8');
            expect(await testApp.db.unit.count()).toBe(3);
        });

        it('refuses the id of a node that stands elsewhere and reveals nothing but that id', async () => {
            const { house, firstEntrance } = await addHouse();
            const other = await addRoot('zone', 'Test Zone');
            const before = await counts();

            expect(
                await refusalOf(
                    addChild(other.id, 'building', 'Building 1', {
                        id: firstEntrance.id,
                    }),
                ),
            ).toEqual({
                code: 'STRUCTURE_ID_TAKEN',
                details: { id: firstEntrance.id },
            });
            expect(
                await refusalOf(
                    addChild(house.id, 'entrance', 'Entrance 3', {
                        id: house.id,
                    }),
                ),
            ).toEqual({
                code: 'STRUCTURE_ID_TAKEN',
                details: { id: house.id },
            });
            expect(
                await refusalOf(
                    transactions().run((tx) =>
                        building().createRoot(tx, {
                            id: firstEntrance.id,
                            kind: 'building',
                            name: 'Test House',
                            address: null,
                        }),
                    ),
                ),
            ).toEqual({
                code: 'STRUCTURE_ID_TAKEN',
                details: { id: firstEntrance.id },
            });

            expect(await counts()).toEqual(before);
        });

        it('refuses the id of a node of another kind under the same parent', async () => {
            const zone = await addRoot('zone', 'Test Zone');
            const line = await addChild(zone.id, 'line', 'Line A');

            expect(
                await refusalOf(
                    addChild(zone.id, 'building', 'Building 1', {
                        id: line.id,
                    }),
                ),
            ).toEqual({
                code: 'STRUCTURE_ID_TAKEN',
                details: { id: line.id },
            });
        });

        it('refuses the id of a unit that belongs to another node or has another type', async () => {
            const { secondEntrance, apartment7 } = await addHouse();
            const { line, privateHouse } = await addQuarter();
            const before = await counts();

            expect(
                await refusalOf(
                    addUnit(secondEntrance.id, 'apartment', '50', {
                        id: apartment7.id,
                    }),
                ),
            ).toEqual({
                code: 'STRUCTURE_ID_TAKEN',
                details: { id: apartment7.id },
            });
            expect(
                await refusalOf(
                    addUnit(line.id, 'duplex', '12A', { id: privateHouse.id }),
                ),
            ).toEqual({
                code: 'STRUCTURE_ID_TAKEN',
                details: { id: privateHouse.id },
            });

            expect(await counts()).toEqual(before);
        });
    });

    describe('refusals', () => {
        it('refuses a child that breaks the order of levels and stores nothing', async () => {
            const { house } = await addHouse();

            await expect(
                addChild(house.id, 'zone', 'Test Zone'),
            ).rejects.toMatchObject({
                code: 'STRUCTURE_CHILD_KIND_FORBIDDEN',
                details: { parentKind: 'building', childKind: 'zone' },
            });

            expect(await testApp.db.node.count()).toBe(3);
            expect(await testApp.db.nodeAncestor.count()).toBe(5);
        });

        it('refuses a root that is not a quarter, a zone or a building', async () => {
            await expect(
                addRoot('entrance', 'Entrance 1'),
            ).rejects.toMatchObject({ code: 'STRUCTURE_ROOT_KIND_FORBIDDEN' });

            expect(await testApp.db.node.count()).toBe(0);
        });

        it('refuses a floor for a private house', async () => {
            const { line } = await addQuarter();

            await expect(
                addUnit(line.id, 'house', '14', { floor: 1 }),
            ).rejects.toMatchObject({ code: 'STRUCTURE_UNIT_FLOOR_FORBIDDEN' });

            expect(await testApp.db.unit.count()).toBe(2);
        });

        it('refuses an apartment on a line and a unit right under a zone', async () => {
            const { line, housesZone } = await addQuarter();

            await expect(
                addUnit(line.id, 'apartment', '14'),
            ).rejects.toMatchObject({
                code: 'STRUCTURE_UNIT_PLACEMENT_FORBIDDEN',
            });
            await expect(
                addUnit(housesZone.id, 'house', '14'),
            ).rejects.toMatchObject({
                code: 'STRUCTURE_UNIT_PLACEMENT_FORBIDDEN',
            });
        });

        it('refuses a second unit with the same number in one node, but not in another', async () => {
            const { firstEntrance, secondEntrance } = await addHouse();

            await expect(
                addUnit(firstEntrance.id, 'apartment', '7'),
            ).rejects.toMatchObject({
                code: 'STRUCTURE_UNIT_NUMBER_TAKEN',
                details: { nodeId: firstEntrance.id },
            });
            await expect(
                addUnit(secondEntrance.id, 'apartment', '7'),
            ).resolves.toMatchObject({ number: '7' });

            expect(await testApp.db.unit.count()).toBe(3);
        });

        it('reports a parent, a node and a unit that do not exist', async () => {
            await expect(
                addChild(UNKNOWN_ID, 'zone', 'Test Zone'),
            ).rejects.toMatchObject({
                code: 'STRUCTURE_NODE_NOT_FOUND',
                details: { nodeId: UNKNOWN_ID },
            });
            await expect(
                addUnit(UNKNOWN_ID, 'apartment', '1'),
            ).rejects.toMatchObject({ code: 'STRUCTURE_NODE_NOT_FOUND' });
            await expect(reading().subtreeOf(UNKNOWN_ID)).rejects.toMatchObject(
                { code: 'STRUCTURE_NODE_NOT_FOUND' },
            );
            await expect(
                reading().chainOfUnit(UNKNOWN_ID),
            ).rejects.toMatchObject({
                code: 'STRUCTURE_UNIT_NOT_FOUND',
                details: { unitId: UNKNOWN_ID },
            });
        });

        it('leaves no part of the tree when the transaction rolls back', async () => {
            await expect(
                transactions().run(async (tx) => {
                    const root = await building().createRoot(tx, {
                        id: nextId(),
                        kind: 'building',
                        name: 'Test House',
                        address: null,
                    });
                    await building().createChild(tx, {
                        id: nextId(),
                        parentId: root.id,
                        kind: 'line',
                        name: 'Line A',
                        address: null,
                    });
                }),
            ).rejects.toMatchObject({ code: 'STRUCTURE_CHILD_KIND_FORBIDDEN' });

            expect(await testApp.db.node.count()).toBe(0);
            expect(await testApp.db.nodeAncestor.count()).toBe(0);
        });
    });
});
