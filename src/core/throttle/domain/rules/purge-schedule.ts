const PURGE_INTERVAL_MS = 300_000;
const PURGE_LEAD_MS = 30_000;

export const PURGE_BATCH = 5000;

export const nextPurgeAt = (now: Date): Date =>
    new Date(
        (Math.floor((now.getTime() + PURGE_LEAD_MS) / PURGE_INTERVAL_MS) + 1) *
            PURGE_INTERVAL_MS,
    );
