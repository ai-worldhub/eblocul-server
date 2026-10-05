const BACKOFF_FACTOR = 2;
const JITTER_SHARE = 0.25;

export type RetryPolicy = {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
};

export const retryDelayMs = (
    attempt: number,
    policy: RetryPolicy,
    jitter: number,
): number => {
    const grown = Math.min(
        policy.maxDelayMs,
        policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1),
    );
    return Math.round(grown * (1 + JITTER_SHARE * jitter));
};
