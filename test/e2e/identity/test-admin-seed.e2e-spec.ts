import { ConfigService } from '@nestjs/config';
import { LAB_SEEDS } from '../../../src/app/lab-seeds.ts';
import { AccountService } from '../../../src/core/identity/application/services/account.service.ts';
import {
    TEST_ADMIN,
    TestAdminSeed,
} from '../../../src/core/identity/application/seeds/test-admin.seed.ts';
import { signIn } from '../../utils/admin-session.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { createSeedRun } from '../../utils/seed-runner.ts';

const SEED_PASSWORD = 'e2e-password-not-real-1';

describe('Seed identity.test_admin (e2e)', () => {
    const testApp = useTestApp();

    const seedWith = (password: string): TestAdminSeed => {
        vi.stubEnv('SEED_ADMIN_PASSWORD', password);
        return new TestAdminSeed(
            testApp.app.get(AccountService),
            new ConfigService(),
        );
    };

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('creates the administrator once and lets him sign in', async () => {
        const run = await createSeedRun(LAB_SEEDS);

        await run.runner.run();
        await run.runner.run();
        await run.close();

        const accounts = await testApp.db.account.findMany({
            include: { password: true },
        });
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatchObject({
            firstName: TEST_ADMIN.firstName,
            lastName: TEST_ADMIN.lastName,
            phone: TEST_ADMIN.phone,
            email: TEST_ADMIN.email,
            phoneVerifiedAt: null,
        });
        expect(accounts[0]?.password?.hash).not.toContain(SEED_PASSWORD);
        await signIn(testApp, {
            email: TEST_ADMIN.email,
            password: SEED_PASSWORD,
        }).expect(200);
    });

    it('fails when the password is not set, and creates nothing', async () => {
        await expect(seedWith('').run()).rejects.toMatchObject({
            code: 'IDENTITY_SEED_PASSWORD_MISSING',
        });

        expect(await testApp.db.account.count()).toBe(0);
    });

    it('fails when the password breaks the password rules', async () => {
        await expect(seedWith('short').run()).rejects.toMatchObject({
            code: 'IDENTITY_PASSWORD_WEAK',
        });

        expect(await testApp.db.account.count()).toBe(0);
    });
});
