import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app/app.module.ts';
import type { LabSeedType } from '../../src/shared/seeding/lab-seed.ts';
import { SeedRunner } from '../../src/shared/seeding/seed-runner.service.ts';
import { SeedingModule } from '../../src/shared/seeding/seeding.module.ts';
import {
    FailingSeedDouble,
    FirstSeedDouble,
    SameNameSeedDouble,
    SecondSeedDouble,
    SeedJournal,
} from './lab-seed.double.ts';

export type SeedRun = {
    journal: SeedJournal;
    runner: SeedRunner;
    close: () => Promise<void>;
};

export const createSeedRun = async (
    seeds: readonly LabSeedType[],
): Promise<SeedRun> => {
    const journal = new SeedJournal();
    const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule, SeedingModule.register(seeds)],
        providers: [
            {
                provide: FirstSeedDouble,
                useValue: new FirstSeedDouble(journal),
            },
            {
                provide: SecondSeedDouble,
                useValue: new SecondSeedDouble(journal),
            },
            {
                provide: SameNameSeedDouble,
                useValue: new SameNameSeedDouble(journal),
            },
            { provide: FailingSeedDouble, useValue: new FailingSeedDouble() },
        ],
    }).compile();
    await moduleRef.init();

    return {
        journal,
        runner: moduleRef.get(SeedRunner),
        close: () => moduleRef.close(),
    };
};
