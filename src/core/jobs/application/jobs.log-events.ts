export {};

declare module '../../../shared/logging/log-events.ts' {
    interface LogEvents {
        'jobs.worker_started': { concurrency: number; kinds: number };
        'jobs.worker_stopped': { abandoned: number };
        'jobs.poll_failed': Record<string, never>;
        'jobs.job_finished': {
            jobId: string;
            kind: string;
            attempt: number;
            durationMs: number;
        };
        'jobs.job_failed': { jobId: string; kind: string; attempt: number };
        'jobs.job_dead': { jobId: string; kind: string; attempts: number };
        'jobs.job_released': { jobId: string; kind: string };
        'jobs.lease_lost': { jobId: string; kind: string };
        'jobs.lease_renewal_failed': { jobId: string; kind: string };
        'jobs.job_release_failed': { jobId: string; kind: string };
    }
}
