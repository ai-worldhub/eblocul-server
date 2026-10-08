import { Injectable } from '@nestjs/common';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { LabSeed } from '../../../../shared/seeding/lab-seed.ts';
import { TreeBuildingService } from '../services/tree-building.service.ts';
import { TreeReadingService } from '../services/tree-reading.service.ts';
import { apartmentsIn } from './apartment-range.ts';

export const TEST_QUARTER = {
    name: 'Test Quarter',
    address: 'Example Avenue, Testville',
    apartmentsZone: {
        name: 'Test Zone Apartments',
        building: {
            name: 'Building 1',
            address: '10 Example Avenue, Testville',
            entrances: [
                { name: 'Entrance 1', firstApartment: 1, lastApartment: 20 },
                { name: 'Entrance 2', firstApartment: 21, lastApartment: 40 },
            ],
        },
    },
    housesZone: {
        name: 'Test Zone Houses',
        line: {
            name: 'Line A',
            houses: [
                '1',
                '2',
                '3',
                '4',
                '5',
                '6',
                '7',
                '8',
                '9',
                '10',
                '11',
                '12',
                '12A',
            ],
        },
    },
} as const;

@Injectable()
export class TestQuarterSeed extends LabSeed {
    readonly name = 'structure.test_quarter';

    constructor(
        private readonly _building: TreeBuildingService,
        private readonly _reading: TreeReadingService,
        private readonly _transactions: Transactions,
        private readonly _ids: Ids,
    ) {
        super();
    }

    async run(): Promise<void> {
        if (await this._reading.rootExistsByName(TEST_QUARTER.name)) {
            return;
        }
        await this._transactions.run(async (tx) => {
            const quarter = await this._building.createRoot(tx, {
                id: this._ids.next(),
                kind: 'quarter',
                name: TEST_QUARTER.name,
                address: TEST_QUARTER.address,
            });
            await this._addApartmentsZone(tx, quarter.id);
            await this._addHousesZone(tx, quarter.id);
        });
    }

    private async _addApartmentsZone(tx: Tx, quarterId: string): Promise<void> {
        const { name, building } = TEST_QUARTER.apartmentsZone;
        const zone = await this._building.createChild(tx, {
            id: this._ids.next(),
            parentId: quarterId,
            kind: 'zone',
            name,
            address: null,
        });
        const house = await this._building.createChild(tx, {
            id: this._ids.next(),
            parentId: zone.id,
            kind: 'building',
            name: building.name,
            address: building.address,
        });
        for (const entrance of building.entrances) {
            const { id: entranceId } = await this._building.createChild(tx, {
                id: this._ids.next(),
                parentId: house.id,
                kind: 'entrance',
                name: entrance.name,
                address: null,
            });
            for (const { number, floor } of apartmentsIn(entrance)) {
                await this._building.createUnit(tx, {
                    id: this._ids.next(),
                    nodeId: entranceId,
                    type: 'apartment',
                    number,
                    floor,
                });
            }
        }
    }

    private async _addHousesZone(tx: Tx, quarterId: string): Promise<void> {
        const { name, line } = TEST_QUARTER.housesZone;
        const zone = await this._building.createChild(tx, {
            id: this._ids.next(),
            parentId: quarterId,
            kind: 'zone',
            name,
            address: null,
        });
        const { id: lineId } = await this._building.createChild(tx, {
            id: this._ids.next(),
            parentId: zone.id,
            kind: 'line',
            name: line.name,
            address: null,
        });
        for (const number of line.houses) {
            await this._building.createUnit(tx, {
                id: this._ids.next(),
                nodeId: lineId,
                type: 'house',
                number,
                floor: null,
            });
        }
    }
}
