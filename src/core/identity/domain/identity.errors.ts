export type IdentityErrorCode =
    | 'IDENTITY_CREDENTIALS_INVALID'
    | 'IDENTITY_SESSION_REQUIRED'
    | 'IDENTITY_ORIGIN_FORBIDDEN'
    | 'IDENTITY_PASSWORD_WEAK'
    | 'IDENTITY_SEED_PASSWORD_MISSING';

export class IdentityError extends Error {
    constructor(
        readonly code: IdentityErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'IdentityError';
    }
}
