import {
    type RetryPolicy,
    retryDelayMs,
} from '../../../src/core/jobs/domain/retry-policy.ts';

const POLICY: RetryPolicy = {
    maxAttempts: 10,
    baseDelayMs: 1000,
    maxDelayMs: 10_000,
};

describe('retryDelayMs', () => {
    it('doubles with every attempt', () => {
        expect(
            [1, 2, 3, 4].map((attempt) => retryDelayMs(attempt, POLICY, 0)),
        ).toEqual([1000, 2000, 4000, 8000]);
    });

    it('stops growing at the limit of the policy', () => {
        expect(retryDelayMs(5, POLICY, 0)).toBe(10_000);
        expect(retryDelayMs(50, POLICY, 0)).toBe(10_000);
    });

    it('adds up to a quarter on top at random', () => {
        expect(retryDelayMs(1, POLICY, 0.5)).toBe(1125);
        expect(retryDelayMs(3, POLICY, 1)).toBe(5000);
        expect(retryDelayMs(5, POLICY, 1)).toBe(12_500);
    });
});
