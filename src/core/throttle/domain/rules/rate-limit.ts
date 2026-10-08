import { ThrottleError } from '../throttle.errors.ts';

const SECOND_MS = 1000;
const GROUP_PATTERN = /^[a-z][a-z0-9_]*$/;

export type RateLimitInput = {
    group: string;
    burst: number;
    refillSeconds: number;
};

export type RateLimit = {
    readonly group: string;
    readonly burst: number;
    readonly intervalMs: number;
};

export type TokenDecision =
    | { isTaken: true; fullAt: Date }
    | { isTaken: false; retryAfterSeconds: number };

export const defineRateLimit = (input: RateLimitInput): RateLimit => {
    const intervalMs = Math.round(input.refillSeconds * SECOND_MS);
    if (
        !GROUP_PATTERN.test(input.group) ||
        !Number.isInteger(input.burst) ||
        input.burst < 1 ||
        !Number.isFinite(intervalMs) ||
        intervalMs < 1
    ) {
        throw new ThrottleError(
            'THROTTLE_RULE_INVALID',
            'Rate limit needs a lower snake_case group, a whole burst of at least 1 and a positive refill time',
            { group: input.group },
        );
    }
    return { group: input.group, burst: input.burst, intervalMs };
};

export const PUBLIC_RATE_LIMIT = defineRateLimit({
    group: 'public',
    burst: 60,
    refillSeconds: 1,
});

export const bucketHorizon = (limit: RateLimit, now: Date): Date =>
    new Date(now.getTime() + limit.burst * limit.intervalMs);

export const takeToken = (
    limit: RateLimit,
    fullAt: Date | null,
    now: Date,
): TokenDecision => {
    const next =
        Math.max(fullAt?.getTime() ?? now.getTime(), now.getTime()) +
        limit.intervalMs;
    const horizon = bucketHorizon(limit, now).getTime();
    return next <= horizon
        ? { isTaken: true, fullAt: new Date(next) }
        : {
              isTaken: false,
              retryAfterSeconds: Math.ceil((next - horizon) / SECOND_MS),
          };
};

export const retryAfterSecondsOf = (
    limit: RateLimit,
    fullAt: Date | null,
    now: Date,
): number => {
    const decision = takeToken(limit, fullAt, now);
    return decision.isTaken
        ? Math.ceil(limit.intervalMs / SECOND_MS)
        : decision.retryAfterSeconds;
};
