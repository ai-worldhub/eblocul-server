import { CLASS_RETRY_POLICIES, type JobClass } from './job-class.ts';
import { JobsError } from './jobs.errors.ts';
import type { RetryPolicy } from './retry-policy.ts';

const KIND_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

type JobPayloadValue =
    | string
    | number
    | boolean
    | null
    | JobPayloadValue[]
    | { [key: string]: JobPayloadValue };

export type JobPayload = { [key: string]: JobPayloadValue };

export type JobDefinition<P extends JobPayload = JobPayload> = {
    readonly kind: string;
    readonly class: JobClass;
    readonly retry: RetryPolicy;
    readonly payloadShape?: P;
};

export type JobDefinitionInput = {
    kind: string;
    class: JobClass;
    retry?: Partial<RetryPolicy>;
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
    const byClass = CLASS_RETRY_POLICIES[input.class];
    return {
        kind: input.kind,
        class: input.class,
        retry: {
            maxAttempts: input.retry?.maxAttempts ?? byClass.maxAttempts,
            baseDelayMs: input.retry?.baseDelayMs ?? byClass.baseDelayMs,
            maxDelayMs: input.retry?.maxDelayMs ?? byClass.maxDelayMs,
        },
    };
};
