import type { IdentityErrorCode } from '../domain/identity.errors.ts';

export const IDENTITY_ERROR_STATUSES = {
    IDENTITY_CREDENTIALS_INVALID: 401,
    IDENTITY_SESSION_REQUIRED: 401,
    IDENTITY_ORIGIN_FORBIDDEN: 403,
    IDENTITY_PASSWORD_WEAK: 400,
    IDENTITY_SEED_PASSWORD_MISSING: 500,
} satisfies Record<IdentityErrorCode, number>;
