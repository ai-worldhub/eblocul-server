export const CANCEL_GRACE_MS = 8000;

export const isTimeLimitExceeded = (
    startedAt: Date,
    timeLimitMs: number,
    now: Date,
): boolean => now.getTime() - startedAt.getTime() >= timeLimitMs;

export const isCancelIgnored = (cancelledAt: Date, now: Date): boolean =>
    now.getTime() - cancelledAt.getTime() >= CANCEL_GRACE_MS;
