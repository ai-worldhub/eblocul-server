import {
    CLASS_RETRY_POLICIES,
    CLASS_TIME_LIMITS_MS,
    type JobClass,
} from './job-class.ts';
import { JobsError } from './jobs.errors.ts';
import type { RetryPolicy } from './retry-policy.ts';

const KIND_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const KILOBYTE = 1024;

export const PAYLOAD_MAX_BYTES = 64 * KILOBYTE;

type JobPayloadValue =
    | string
    | number
    | boolean
    | null
    | JobPayloadValue[]
    | { [key: string]: JobPayloadValue };

export type JobPayload = { [key: string]: JobPayloadValue };

export const payloadSizeBytes = (payload: JobPayload): number =>
    new TextEncoder().encode(JSON.stringify(payload)).length;

export type JobDefinition<P extends JobPayload = JobPayload> = {
    readonly kind: string;
    readonly class: JobClass;
    readonly retry: RetryPolicy;
    readonly timeLimitMs: number;
    readonly payloadShape?: P;
};

export type JobDefinitionInput = {
    kind: string;
    class: JobClass;
    retry?: Partial<RetryPolicy>;
    timeLimitMs?: number;
};

export const defineJob = <P extends JobPayload>(
    input: JobDefinitionInput,
): JobDefinition<P> => {
    if (!KIND_PATTERN.test(input.kind)) {
        throw new JobsError(
            'JOBS_KIND_INVALID',
            'Job kind is <module>.<job> in lower snake_case',
            { kind: input.kind },
        );
    }
    const timeLimitMs = input.timeLimitMs ?? CLASS_TIME_LIMITS_MS[input.class];
    if (!Number.isInteger(timeLimitMs) || timeLimitMs <= 0) {
        throw new JobsError(
            'JOBS_TIME_LIMIT_INVALID',
            'Job time limit is a positive whole number of milliseconds',
            { kind: input.kind, timeLimitMs },
        );
    }
    const byClass = CLASS_RETRY_POLICIES[input.class];
    return {
        kind: input.kind,
        class: input.class,
        retry: {
            maxAttempts: input.retry?.maxAttempts ?? byClass.maxAttempts,
            baseDelayMs: input.retry?.baseDelayMs ?? byClass.baseDelayMs,
            maxDelayMs: input.retry?.maxDelayMs ?? byClass.maxDelayMs,
        },
        timeLimitMs,
    };
};
