import type { AuthzRefusalCode } from '../domain/authz.errors.ts';

export const AUTHZ_ERROR_STATUSES = {
    AUTHZ_GRANT_REQUIRED: 400,
    AUTHZ_GRANT_NOT_ACTIVE: 403,
    AUTHZ_ACTION_FORBIDDEN: 403,
    AUTHZ_TARGET_NOT_FOUND: 404,
} satisfies Record<AuthzRefusalCode, number>;
