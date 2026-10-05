export type JobsErrorCode =
    | 'JOBS_KIND_INVALID'
    | 'JOBS_KIND_DUPLICATED'
    | 'JOBS_KIND_UNKNOWN'
    | 'JOBS_CLASS_UNKNOWN'
    | 'JOBS_PAYLOAD_TOO_LARGE'
    | 'JOBS_JOB_NOT_DUE'
    | 'JOBS_LEASE_LOST';

export class JobsError extends Error {
    constructor(
        readonly code: JobsErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'JobsError';
    }
}
