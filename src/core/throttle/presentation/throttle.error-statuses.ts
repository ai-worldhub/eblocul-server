import type { ThrottleErrorCode } from '../domain/throttle.errors.ts';

export const THROTTLE_ERROR_STATUSES = {
    THROTTLE_RATE_LIMITED: 429,
    THROTTLE_ATTEMPTS_LOCKED: 429,
    THROTTLE_RULE_INVALID: 500,
} satisfies Record<ThrottleErrorCode, number>;
