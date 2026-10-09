export type IdentityRefusalCode =
    | 'IDENTITY_CREDENTIALS_INVALID'
    | 'IDENTITY_SESSION_REQUIRED'
    | 'IDENTITY_ORIGIN_FORBIDDEN'
    | 'IDENTITY_PASSWORD_WEAK';

export type IdentityFaultCode = 'IDENTITY_SEED_PASSWORD_MISSING';

export type IdentityErrorCode = IdentityRefusalCode | IdentityFaultCode;

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
