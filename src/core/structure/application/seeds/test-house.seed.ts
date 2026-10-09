import { Injectable } from '@nestjs/common';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { LabSeed } from '../../../../shared/seeding/lab-seed.ts';
import { TreeBuildingService } from '../services/tree-building.service.ts';
import { TreeReadingService } from '../services/tree-reading.service.ts';
import { apartmentsIn } from './apartment-range.ts';

export const TEST_HOUSE = {
    name: 'Test House',
    address: '1 Example Street, Testville',
    entrances: [
        { name: 'Entrance 1', firstApartment: 1, lastApartment: 38 },
        { name: 'Entrance 2', firstApartment: 39, lastApartment: 76 },
    ],
} as const;

@Injectable()
export class TestHouseSeed extends LabSeed {
    readonly name = 'structure.test_house';

    constructor(
        private readonly _building: TreeBuildingService,
        private readonly _reading: TreeReadingService,
        private readonly _transactions: Transactions,
        private readonly _ids: Ids,
    ) {
        super();
    }

    async run(): Promise<void> {
        if (await this._reading.rootExistsByName(TEST_HOUSE.name)) {
            return;
        }
        await this._transactions.run(async (tx) => {
            const house = await this._building.createRoot(tx, {
                id: this._ids.next(),
                kind: 'building',
                name: TEST_HOUSE.name,
                address: TEST_HOUSE.address,
            });
            for (const entrance of TEST_HOUSE.entrances) {
                const { id: entranceId } = await this._building.createChild(
                    tx,
                    {
                        id: this._ids.next(),
                        parentId: house.id,
                        kind: 'entrance',
                        name: entrance.name,
                        address: null,
                    },
                );
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
        });
    }
}
