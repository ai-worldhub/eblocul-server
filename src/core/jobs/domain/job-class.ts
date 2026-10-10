import { JobsError } from './jobs.errors.ts';
import type { RetryPolicy } from './retry-policy.ts';

export const JOB_CLASSES = [
    'p0',
    'p1',
    'p2',
    'p3',
    'p4_short',
    'p4_long',
] as const;

export type JobClass = (typeof JOB_CLASSES)[number];

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const CLASS_RETRY_POLICIES: Record<JobClass, RetryPolicy> = {
    p0: { maxAttempts: 3, baseDelayMs: SECOND_MS, maxDelayMs: 10 * SECOND_MS },
    p1: {
        maxAttempts: 6,
        baseDelayMs: 5 * SECOND_MS,
        maxDelayMs: 5 * MINUTE_MS,
    },
    p2: {
        maxAttempts: 8,
        baseDelayMs: 30 * SECOND_MS,
        maxDelayMs: 30 * MINUTE_MS,
    },
    p3: { maxAttempts: 8, baseDelayMs: MINUTE_MS, maxDelayMs: HOUR_MS },
    p4_short: {
        maxAttempts: 5,
        baseDelayMs: 30 * SECOND_MS,
        maxDelayMs: 10 * MINUTE_MS,
    },
    p4_long: {
        maxAttempts: 3,
        baseDelayMs: MINUTE_MS,
        maxDelayMs: 30 * MINUTE_MS,
    },
};

export const CLASS_TIME_LIMITS_MS: Record<JobClass, number> = {
    p0: 10 * SECOND_MS,
    p1: 30 * SECOND_MS,
    p2: MINUTE_MS,
    p3: 5 * MINUTE_MS,
    p4_short: MINUTE_MS,
    p4_long: 15 * MINUTE_MS,
};

const isJobClass = (value: string): value is JobClass =>
    JOB_CLASSES.some((known) => known === value);

export const parseJobClasses = (list: string | undefined): JobClass[] => {
    if (list === undefined) {
        return [...JOB_CLASSES];
    }
    const names = list.split(',').map((name) => name.trim());
    const unknown = names.filter((name) => !isJobClass(name));
    if (unknown.length > 0) {
        throw new JobsError('JOBS_CLASS_UNKNOWN', 'Unknown job class', {
            classes: unknown,
        });
    }
    return names.filter(isJobClass);
};
