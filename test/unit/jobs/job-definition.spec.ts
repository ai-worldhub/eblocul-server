import {
    CLASS_RETRY_POLICIES,
    JOB_CLASSES,
    parseJobClasses,
} from '../../../src/core/jobs/domain/job-class.ts';
import { defineJob } from '../../../src/core/jobs/domain/job-definition.ts';

describe('defineJob', () => {
    it('takes the retry policy of its class', () => {
        const job = defineJob({ kind: 'probe.work', class: 'p2' });

        expect(job).toEqual({
            kind: 'probe.work',
            class: 'p2',
            retry: CLASS_RETRY_POLICIES.p2,
        });
    });

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
