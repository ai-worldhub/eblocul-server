import { assertSeedable } from '../../../src/shared/seeding/seedable-environment.ts';
import { SeedingError } from '../../../src/shared/seeding/seeding.errors.ts';

describe('assertSeedable', () => {
    it.each(['lab', 'e2e'] as const)('allows %s', (environment) => {
        expect(() => assertSeedable(environment)).not.toThrow();
    });

    it('refuses production', () => {
        const refuse = (): void => assertSeedable('production');

        expect(refuse).toThrow(SeedingError);
        expect(refuse).toThrow(
            expect.objectContaining({ code: 'SEEDING_ENVIRONMENT_FORBIDDEN' }),
        );
    });
});
