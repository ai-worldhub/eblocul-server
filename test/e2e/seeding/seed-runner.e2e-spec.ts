import { SeedingError } from '../../../src/shared/seeding/seeding.errors.ts';
import {
    FailingSeedDouble,
    FirstSeedDouble,
    SameNameSeedDouble,
    SecondSeedDouble,
} from '../../utils/lab-seed.double.ts';
import { createSeedRun, type SeedRun } from '../../utils/seed-runner.ts';

describe('Seed runner (e2e)', () => {
    let seedRun: SeedRun | undefined;

    afterEach(async () => {
        await seedRun?.close();
        seedRun = undefined;
    });

    it('applies seeds in the order of the list', async () => {
        seedRun = await createSeedRun([SecondSeedDouble, FirstSeedDouble]);

        await seedRun.runner.run();

        expect(seedRun.journal.applied).toEqual([
            'probe.second',
            'probe.first',
        ]);
    });

    it('finishes with an empty list', async () => {
        seedRun = await createSeedRun([]);

        await expect(seedRun.runner.runAndReport()).resolves.toBe(true);
    });

    it('stops at the first failing seed and reports the failure', async () => {
        seedRun = await createSeedRun([
            FirstSeedDouble,
            FailingSeedDouble,
            SecondSeedDouble,
        ]);

        await expect(seedRun.runner.runAndReport()).resolves.toBe(false);

        expect(seedRun.journal.applied).toEqual(['probe.first']);
    });

    it('applies nothing when two seeds share a name', async () => {
        seedRun = await createSeedRun([FirstSeedDouble, SameNameSeedDouble]);

        const failure: unknown = await seedRun.runner
            .run()
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(SeedingError);
        expect(failure).toMatchObject({ code: 'SEEDING_NAME_DUPLICATED' });
        expect(seedRun.journal.applied).toEqual([]);
    });
});
