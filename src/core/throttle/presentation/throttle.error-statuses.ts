import type { ThrottleRefusalCode } from '../domain/throttle.errors.ts';

export const THROTTLE_ERROR_STATUSES = {
    THROTTLE_RATE_LIMITED: 429,
    THROTTLE_ATTEMPTS_LOCKED: 429,
} satisfies Record<ThrottleRefusalCode, number>;
