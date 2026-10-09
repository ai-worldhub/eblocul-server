export type IdentityRefusalCode =
    | 'IDENTITY_CREDENTIALS_INVALID'
    | 'IDENTITY_SESSION_REQUIRED'
    | 'IDENTITY_ORIGIN_FORBIDDEN'
    | 'IDENTITY_PASSWORD_WEAK'
    | 'IDENTITY_PHONE_INVALID'
    | 'IDENTITY_CODE_INVALID'
    | 'IDENTITY_CODE_EXPIRED'
    | 'IDENTITY_PENDING_TOKEN_INVALID'
    | 'IDENTITY_CONSENT_VERSION_OUTDATED';

export type IdentityFaultCode =
    'IDENTITY_SEED_PASSWORD_MISSING' | 'IDENTITY_CODE_CHANNEL_MISSING';

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
