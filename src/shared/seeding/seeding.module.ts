import { type DynamicModule, Module } from '@nestjs/common';
import type { LabSeedType } from './lab-seed.ts';
import { LAB_SEED_TYPES, SeedRunner } from './seed-runner.service.ts';

@Module({})
export class SeedingModule {
    static register(seeds: readonly LabSeedType[]): DynamicModule {
        return {
            module: SeedingModule,
            providers: [
                { provide: LAB_SEED_TYPES, useValue: seeds },
                SeedRunner,
            ],
        };
    }
}
