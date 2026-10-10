import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import { LabSeed } from '../../../../shared/seeding/lab-seed.ts';
import { AccountService, TEST_ADMIN } from '../../../identity/index.ts';
import { SYSTEM_ACTOR } from '../../../journal/index.ts';
import {
    TEST_HOUSE,
    TEST_QUARTER,
    TreeReadingService,
} from '../../../structure/index.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import { NodeAssignmentService } from '../services/node-assignment.service.ts';

export const TEST_CHIEF = {
    firstName: 'Test',
    lastName: 'Chief Administrator',
    phone: '+37360000001',
    email: 'chief@example.com',
    language: 'ru',
} as const;

export const TEST_ZONE_ADMIN = {
    firstName: 'Test',
    lastName: 'Zone Administrator',
    phone: '+37360000002',
    email: 'zone-admin@example.com',
    language: 'ro',
} as const;

export const TEST_CHAIRMAN = {
    firstName: 'Test',
    lastName: 'Chairman',
    phone: '+37360000003',
    email: 'chairman@example.com',
    language: 'ru',
} as const;

type SeedAccount = {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    language: 'ro' | 'ru';
};

type SeedPlaces = {
    adminId: string;
    houseId: string;
    quarterId: string;
    zoneId: string;
};

@Injectable()
export class TestRolesSeed extends LabSeed {
    readonly name = 'membership.test_roles';

    constructor(
        private readonly _assignments: NodeAssignmentService,
        private readonly _accounts: AccountService,
        private readonly _tree: TreeReadingService,
        private readonly _transactions: Transactions,
        private readonly _config: ConfigService,
    ) {
        super();
    }

    async run(): Promise<void> {
        const places = await this._places();
        const chiefId = await this._account(TEST_CHIEF);
        const zoneAdminId = await this._account(TEST_ZONE_ADMIN);
        const chairmanId = await this._account(TEST_CHAIRMAN);
        await this._transactions.run(async (tx) => {
            await this._assignments.assign(
                tx,
                {
                    accountId: places.adminId,
                    nodeId: places.houseId,
                    role: 'administrator',
                },
                SYSTEM_ACTOR,
            );
            await this._assignments.assign(
                tx,
                {
                    accountId: chairmanId,
                    nodeId: places.houseId,
                    role: 'chairman',
                },
                SYSTEM_ACTOR,
            );
            await this._assignments.assign(
                tx,
                {
                    accountId: chiefId,
                    nodeId: places.quarterId,
                    role: 'chief_administrator',
                },
                SYSTEM_ACTOR,
            );
            await this._assignments.assign(
                tx,
                {
                    accountId: zoneAdminId,
                    nodeId: places.zoneId,
                    role: 'administrator',
                },
                SYSTEM_ACTOR,
            );
        });
    }

    private async _places(): Promise<SeedPlaces> {
        const adminId = await this._accounts.findIdByEmail(TEST_ADMIN.email);
        const houseId = await this._tree.rootIdByName(TEST_HOUSE.name);
        const quarterId = await this._tree.rootIdByName(TEST_QUARTER.name);
        const zoneId =
            quarterId === null
                ? null
                : await this._zoneId(
                      quarterId,
                      TEST_QUARTER.apartmentsZone.name,
                  );
        if (
            adminId === null ||
            houseId === null ||
            quarterId === null ||
            zoneId === null
        ) {
            throw new MembershipError(
                'MEMBERSHIP_SEED_DATA_MISSING',
                'Seed the test administrator, the test house and the test quarter first',
            );
        }
        return { adminId, houseId, quarterId, zoneId };
    }

    private async _zoneId(
        quarterId: string,
        name: string,
    ): Promise<string | null> {
        const { nodes } = await this._tree.subtreeOf(quarterId);
        const zone = nodes.find(
            (node) => node.kind === 'zone' && node.name === name,
        );
        return zone?.id ?? null;
    }

    private async _account(account: SeedAccount): Promise<string> {
        const existing = await this._accounts.findIdByEmail(account.email);
        if (existing !== null) {
            return existing;
        }
        const password = this._config.get<string>('SEED_ADMIN_PASSWORD') ?? '';
        if (password === '') {
            throw new MembershipError(
                'MEMBERSHIP_SEED_PASSWORD_MISSING',
                'Set SEED_ADMIN_PASSWORD to seed the accounts of the test roles',
            );
        }
        return this._accounts.createWithPassword({ ...account, password });
    }
}
