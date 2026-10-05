import type { Environment } from '../configs/env.validation.ts';
import { SeedingError } from './seeding.errors.ts';

const SEEDABLE_ENVIRONMENTS: readonly Environment[] = ['lab', 'e2e'];

export const assertSeedable = (environment: Environment): void => {
    if (!SEEDABLE_ENVIRONMENTS.includes(environment)) {
        throw new SeedingError(
            'SEEDING_ENVIRONMENT_FORBIDDEN',
            'Seeds run only in the lab and e2e environments',
            { environment },
        );
    }
};
