import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LabSeed } from '../../../../shared/seeding/lab-seed.ts';
import { IdentityError } from '../../domain/identity.errors.ts';
import { AccountService } from '../services/account.service.ts';

export const TEST_ADMIN = {
    firstName: 'Test',
    lastName: 'Administrator',
    phone: '+37360000000',
    email: 'admin@example.com',
    language: 'ro',
} as const;

@Injectable()
export class TestAdminSeed extends LabSeed {
    readonly name = 'identity.test_admin';

    constructor(
        private readonly _accounts: AccountService,
        private readonly _config: ConfigService,
    ) {
        super();
    }

    async run(): Promise<void> {
        if ((await this._accounts.findIdByEmail(TEST_ADMIN.email)) !== null) {
            return;
        }
        const password = this._config.get<string>('SEED_ADMIN_PASSWORD') ?? '';
        if (password === '') {
            throw new IdentityError(
                'IDENTITY_SEED_PASSWORD_MISSING',
                'Set SEED_ADMIN_PASSWORD to seed the test administrator',
            );
        }
        await this._accounts.createWithPassword({ ...TEST_ADMIN, password });
    }
}
