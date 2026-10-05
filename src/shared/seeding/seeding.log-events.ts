export {};

declare module '../logging/log-events.ts' {
    interface LogEvents {
        'seeding.seed_applied': { seed: string };
        'seeding.seed_failed': { seed: string };
        'seeding.finished': { seeds: number };
        'seeding.failed': { errorType: string; errorCode: string | null };
    }
}
