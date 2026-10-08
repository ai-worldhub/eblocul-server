export {};

declare module '../../../shared/logging/log-events.ts' {
    interface LogEvents {
        'throttle.rate_limited': { group: string; retryAfterSeconds: number };
        'throttle.attempts_locked': { rule: string; lockSeconds: number };
        'throttle.expired_purged': {
            rateBuckets: number;
            attemptSeries: number;
        };
    }
}
