import { Injectable } from '@nestjs/common';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import { LabSeed } from '../../../../shared/seeding/lab-seed.ts';
import { AccountService } from '../../../identity/index.ts';
import { TEST_HOUSE, TreeReadingService } from '../../../structure/index.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import { UnitMembershipService } from '../services/unit-membership.service.ts';

export const TEST_RESIDENT = {
    firstName: 'Test',
    lastName: 'Resident',
    phone: '+37360000004',
    apartment: '1',
} as const;

@Injectable()
export class TestResidentSeed extends LabSeed {
    readonly name = 'membership.test_resident';

    constructor(
        private readonly _memberships: UnitMembershipService,
        private readonly _accounts: AccountService,
        private readonly _tree: TreeReadingService,
        private readonly _transactions: Transactions,
    ) {
        super();
    }

    async run(): Promise<void> {
        const unitId = await this._apartmentId();
        const accountId =
            (await this._accounts.findIdByPhone(TEST_RESIDENT.phone)) ??
            (await this._accounts.createWithConfirmedPhone({
                firstName: TEST_RESIDENT.firstName,
                lastName: TEST_RESIDENT.lastName,
                phone: TEST_RESIDENT.phone,
            }));
        await this._transactions.run((tx) =>
            this._memberships.bind(tx, { accountId, unitId, role: 'owner' }),
        );
    }

    private async _apartmentId(): Promise<string> {
        const houseId = await this._tree.rootIdByName(TEST_HOUSE.name);
        const units =
            houseId === null ? [] : (await this._tree.subtreeOf(houseId)).units;
        const apartment = units.find(
            (unit) =>
                unit.type === 'apartment' &&
                unit.number === TEST_RESIDENT.apartment,
        );
        if (apartment === undefined) {
            throw new MembershipError(
                'MEMBERSHIP_SEED_DATA_MISSING',
                'Seed the test house first',
            );
        }
        return apartment.id;
    }
}
