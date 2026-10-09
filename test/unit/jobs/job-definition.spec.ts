import {
    CLASS_RETRY_POLICIES,
    CLASS_TIME_LIMITS_MS,
    JOB_CLASSES,
    parseJobClasses,
} from '../../../src/core/jobs/domain/job-class.ts';
import { defineJob } from '../../../src/core/jobs/domain/job-definition.ts';

describe('defineJob', () => {
    it('takes the retry policy and the time limit of its class', () => {
        const job = defineJob({ kind: 'probe.work', class: 'p2' });

        expect(job).toEqual({
            kind: 'probe.work',
            class: 'p2',
            retry: CLASS_RETRY_POLICIES.p2,
            timeLimitMs: CLASS_TIME_LIMITS_MS.p2,
        });
    });

    it.each([1, 20_000, 3_600_000])(
        'lets the job set its own time limit of %d ms, below or above the class',
        (timeLimitMs) => {
            const job = defineJob({
                kind: 'probe.work',
                class: 'p2',
                timeLimitMs,
            });

            expect(job.timeLimitMs).toBe(timeLimitMs);
            expect(job.retry).toEqual(CLASS_RETRY_POLICIES.p2);
        },
    );

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'refuses the time limit %d',
        (timeLimitMs) => {
            expect(() =>
                defineJob({ kind: 'probe.work', class: 'p2', timeLimitMs }),
            ).toThrow(
                expect.objectContaining({
                    code: 'JOBS_TIME_LIMIT_INVALID',
                    details: { kind: 'probe.work', timeLimitMs },
                }),
            );
        },
    );

    it('lets the job replace a part of the policy', () => {
        const job = defineJob({
            kind: 'probe.work',
            class: 'p2',
            retry: { maxAttempts: 2 },
        });

        expect(job.retry).toEqual({
            ...CLASS_RETRY_POLICIES.p2,
            maxAttempts: 2,
        });
    });

    it.each(['work', 'Probe.work', 'probe.work.more', 'probe.', 'probe.Work'])(
        'refuses the kind %s',
        (kind) => {
            expect(() => defineJob({ kind, class: 'p1' })).toThrow(
                expect.objectContaining({ code: 'JOBS_KIND_INVALID' }),
            );
        },
    );
});

describe('CLASS_RETRY_POLICIES', () => {
    it('gives every class attempts and a delay that can grow', () => {
        for (const jobClass of JOB_CLASSES) {
            const policy = CLASS_RETRY_POLICIES[jobClass];

            expect(policy.maxAttempts, jobClass).toBeGreaterThan(0);
            expect(policy.baseDelayMs, jobClass).toBeGreaterThan(0);
            expect(policy.maxDelayMs, jobClass).toBeGreaterThanOrEqual(
                policy.baseDelayMs,
            );
        }
    });
});

describe('CLASS_TIME_LIMITS_MS', () => {
    it('holds the limits of the decision on the queue', () => {
        expect(CLASS_TIME_LIMITS_MS).toEqual({
            p0: 10_000,
            p1: 30_000,
            p2: 60_000,
            p3: 300_000,
            p4_short: 60_000,
            p4_long: 900_000,
        });
    });
});

describe('parseJobClasses', () => {
    it('means every class when nothing is set', () => {
        expect(parseJobClasses(undefined)).toEqual([...JOB_CLASSES]);
    });

    it('reads a list of classes', () => {
        expect(parseJobClasses('p4_short, p4_long')).toEqual([
            'p4_short',
            'p4_long',
        ]);
    });

    it('refuses a class it does not know', () => {
        expect(() => parseJobClasses('p0,p9')).toThrow(
            expect.objectContaining({
                code: 'JOBS_CLASS_UNKNOWN',
                details: { classes: ['p9'] },
            }),
        );
    });
});
