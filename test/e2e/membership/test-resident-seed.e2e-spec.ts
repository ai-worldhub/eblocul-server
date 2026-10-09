import { LAB_SEEDS } from '../../../src/app/lab-seeds.ts';
import {
    TEST_RESIDENT,
    TestResidentSeed,
} from '../../../src/core/membership/index.ts';
import { TEST_HOUSE } from '../../../src/core/structure/index.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    bearer,
    codeDoubles,
    confirmSentCode,
} from '../../utils/resident-session.ts';
import { responseBody } from '../../utils/response-body.ts';
import { createSeedRun } from '../../utils/seed-runner.ts';

type AccessBody = {
    accountId: string;
    application: string;
    grants: {
        role: string;
        complex: { name: string };
        unit: { type: string; number: string } | null;
    }[];
};

const ACCESS_PATH = '/api/v1/me/access';

describe('Seed membership.test_resident (e2e)', () => {
    const doubles = codeDoubles();
    const testApp = useTestApp(doubles.override);

    beforeEach(() => {
        doubles.reset();
    });

    const seed = async (times: number): Promise<void> => {
        const run = await createSeedRun(LAB_SEEDS);
        for (let time = 0; time < times; time += 1) {
            await run.runner.run();
        }
        await run.close();
    };

    it('makes one resident who owns apartment 1 of the test house: a second run adds nothing', async () => {
        await seed(2);

        const residents = await testApp.db.account.findMany({
            where: { phone: TEST_RESIDENT.phone },
            include: {
                consents: true,
                password: true,
                unitMemberships: { include: { unit: true } },
            },
        });

        expect(residents).toMatchObject([
            {
                firstName: TEST_RESIDENT.firstName,
                lastName: TEST_RESIDENT.lastName,
                email: null,
                password: null,
                consents: [{ version: 'e2e-version-1' }],
                unitMemberships: [
                    {
                        role: 'owner',
                        endedAt: null,
                        unit: { type: 'apartment', number: '1' },
                    },
                ],
            },
        ]);
        expect(residents[0]?.phoneVerifiedAt).not.toBeNull();
        expect(await testApp.db.unitMembership.count()).toBe(1);
        expect(await testApp.db.account.count()).toBe(5);
    });

    it('lets the seeded resident sign in with a code and see the apartment', async () => {
        await seed(1);

        const signedIn = await confirmSentCode(
            testApp,
            doubles,
            TEST_RESIDENT.phone,
        );
        const response = await testApp
            .http()
            .get(ACCESS_PATH)
            .set('Authorization', bearer(signedIn.session?.token ?? ''))
            .expect(200);

        expect(signedIn.outcome).toBe('signed_in');
        expect(responseBody<AccessBody>(response)).toMatchObject({
            application: 'resident_app',
            grants: [
                {
                    role: 'owner',
                    complex: { name: TEST_HOUSE.name },
                    unit: { type: 'apartment', number: '1' },
                },
            ],
        });
    });

    it('asks for the test house first', async () => {
        await expect(
            testApp.app.get(TestResidentSeed).run(),
        ).rejects.toMatchObject({ code: 'MEMBERSHIP_SEED_DATA_MISSING' });
        expect(await testApp.db.account.count()).toBe(0);
    });
});
