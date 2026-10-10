import { TestAdminSeed } from '../core/identity/index.ts';
import { TestResidentSeed, TestRolesSeed } from '../core/membership/index.ts';
import { TestHouseSeed, TestQuarterSeed } from '../core/structure/index.ts';
import type { LabSeedType } from '../shared/seeding/lab-seed.ts';

export const LAB_SEEDS: readonly LabSeedType[] = [
    TestAdminSeed,
    TestHouseSeed,
    TestQuarterSeed,
    TestRolesSeed,
    TestResidentSeed,
];
