import { ConfigService } from '@nestjs/config';
import { LAB_SEEDS } from '../../../src/app/lab-seeds.ts';
import {
    AccountService,
    TEST_ADMIN,
    TestAdminSeed,
} from '../../../src/core/identity/index.ts';
import {
    TEST_CHAIRMAN,
    TEST_CHIEF,
    TEST_ZONE_ADMIN,
    TestRolesSeed,
} from '../../../src/core/membership/application/seeds/test-roles.seed.ts';
import {
    NodeAssignmentService,
    RequestRoutingService,
} from '../../../src/core/membership/index.ts';
import {
    TEST_HOUSE,
    TEST_QUARTER,
    TreeReadingService,
} from '../../../src/core/structure/index.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { signIn } from '../../utils/admin-session.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { createSeedRun } from '../../utils/seed-runner.ts';

const SEED_PASSWORD = 'e2e-password-not-real-1';

describe('Seed membership.test_roles (e2e)', () => {
    const testApp = useTestApp();

    const seed = async (times: number): Promise<void> => {
        const run = await createSeedRun(LAB_SEEDS);
        for (let time = 0; time < times; time += 1) {
            await run.runner.run();
        }
        await run.close();
    };

    const seedWith = (password: string): TestRolesSeed => {
        vi.stubEnv('SEED_ADMIN_PASSWORD', password);
        return new TestRolesSeed(
            testApp.app.get(NodeAssignmentService),
            testApp.app.get(AccountService),
            testApp.app.get(TreeReadingService),
            testApp.app.get(Transactions),
            new ConfigService(),
        );
    };

    const held = async (): Promise<string[]> => {
        const assignments = await testApp.db.nodeAssignment.findMany({
            where: { endedAt: null },
            include: { account: true, node: true },
        });
        return assignments
            .map(
                ({ account, node, role }) =>
                    `${account.email ?? ''} ${role} ${node.name}`,
            )
            .sort();
    };

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('gives the seeded accounts their roles once: a second run adds nothing', async () => {
        await seed(2);

        expect(await held()).toEqual(
            [
                `${TEST_ADMIN.email} administrator ${TEST_HOUSE.name}`,
                `${TEST_CHAIRMAN.email} chairman ${TEST_HOUSE.name}`,
                `${TEST_CHIEF.email} chief_administrator ${TEST_QUARTER.name}`,
                `${TEST_ZONE_ADMIN.email} administrator ${TEST_QUARTER.apartmentsZone.name}`,
            ].sort(),
        );
        expect(await testApp.db.nodeAssignment.count()).toBe(4);
        expect(await testApp.db.account.count()).toBe(4);
        expect(await testApp.db.unitMembership.count()).toBe(0);
    });

    it('writes every seeded assignment to the action journal once, as made by the system', async () => {
        await seed(2);

        const entries = await testApp.db.journalEntry.findMany({
            include: { subjectAccount: true, ownerNode: true },
        });

        expect(
            entries
                .map(
                    ({ action, actorKind, subjectAccount, ownerNode }) =>
                        `${action} ${actorKind} ${subjectAccount?.email ?? ''} ${ownerNode.name}`,
                )
                .sort(),
        ).toEqual(
            [
                `membership.role_assigned system ${TEST_ADMIN.email} ${TEST_HOUSE.name}`,
                `membership.role_assigned system ${TEST_CHAIRMAN.email} ${TEST_HOUSE.name}`,
                `membership.role_assigned system ${TEST_CHIEF.email} ${TEST_QUARTER.name}`,
                `membership.role_assigned system ${TEST_ZONE_ADMIN.email} ${TEST_QUARTER.apartmentsZone.name}`,
            ].sort(),
        );
    });

    it('leaves the zone of private houses without an administrator: its requests go to the chief administrator', async () => {
        await seed(1);
        const reading = testApp.app.get(TreeReadingService);
        const quarterId = await reading.rootIdByName(TEST_QUARTER.name);
        const { nodes } = await reading.subtreeOf(quarterId ?? '');
        const housesZone = nodes.find(
            (node) => node.name === TEST_QUARTER.housesZone.name,
        );
        const chief = await testApp.db.account.findUniqueOrThrow({
            where: { email: TEST_CHIEF.email },
        });

        const recipients = await testApp.app
            .get(RequestRoutingService)
            .recipientsOf(testApp.db, housesZone?.id ?? '');

        expect(recipients).toEqual({
            role: 'chief_administrator',
            accountIds: [chief.id],
        });
    });

    it('lets every seeded account sign in with the seed password', async () => {
        await seed(1);

        for (const { email } of [TEST_CHIEF, TEST_ZONE_ADMIN, TEST_CHAIRMAN]) {
            await signIn(testApp, { email, password: SEED_PASSWORD }).expect(
                200,
            );
        }
    });

    it('fails when the administrator, the house and the quarter are not seeded, and creates nothing', async () => {
        await expect(seedWith(SEED_PASSWORD).run()).rejects.toMatchObject({
            code: 'MEMBERSHIP_SEED_DATA_MISSING',
        });

        expect(await testApp.db.account.count()).toBe(0);
        expect(await testApp.db.nodeAssignment.count()).toBe(0);
    });

    it('fails when the password is not set, and gives nobody a role', async () => {
        const run = await createSeedRun(
            LAB_SEEDS.filter((type) => type !== TestRolesSeed),
        );
        await run.runner.run();
        await run.close();

        await expect(seedWith('').run()).rejects.toMatchObject({
            code: 'MEMBERSHIP_SEED_PASSWORD_MISSING',
        });

        expect(await testApp.db.account.count()).toBe(1);
        expect(await testApp.db.nodeAssignment.count()).toBe(0);
        expect(LAB_SEEDS).toContain(TestAdminSeed);
    });
});
