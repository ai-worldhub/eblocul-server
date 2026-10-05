export type SeedingErrorCode =
    'SEEDING_ENVIRONMENT_FORBIDDEN' | 'SEEDING_NAME_DUPLICATED';

export class SeedingError extends Error {
    constructor(
        readonly code: SeedingErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'SeedingError';
    }
}
