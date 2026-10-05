import {
    JobEntity,
    type JobSnapshot,
    LEASE_MS,
    leaseCheckIntervalMs,
    leaseNeedsRenewal,
} from '../../../src/core/jobs/domain/job.entity.ts';
import type { RetryPolicy } from '../../../src/core/jobs/domain/retry-policy.ts';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const POLICY: RetryPolicy = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
};

const after = (durationMs: number): Date =>
    new Date(NOW.getTime() + durationMs);

const enqueued = (notBefore: Date | null = null): JobEntity =>
    JobEntity.enqueue({
        id: 'job-1',
        kind: 'probe.work',
        class: 'p1',
        payload: { label: 'first' },
        dedupKey: null,
        notBefore,
        now: NOW,
    });

const taken = (leaseId = 'lease-1'): JobEntity => {
    const job = enqueued();
    job.take({ leaseId, maxAttempts: POLICY.maxAttempts, now: NOW });
    return job;
};

const running = (overrides: Partial<JobSnapshot>): JobEntity =>
    JobEntity.restore({ ...taken().view(), ...overrides });

describe('JobEntity', () => {
    it('waits from the moment it is enqueued', () => {
        expect(enqueued().view()).toEqual({
            id: 'job-1',
            kind: 'probe.work',
            class: 'p1',
            state: 'waiting',
            payload: { label: 'first' },
            dedupKey: null,
            attempts: 0,
            leaseId: null,
            createdAt: NOW,
            availableAt: NOW,
            leaseExpiresAt: null,
        });
    });

    it('hands out a copy of its state, not the state itself', () => {
        const job = enqueued();
        const view = job.view();

        view.attempts = 5;
        view.payload['label'] = 'changed';
        view.createdAt.setTime(0);

        expect(job.view()).toMatchObject({
            attempts: 0,
            payload: { label: 'first' },
            createdAt: NOW,
        });
    });

    it('is not due before the time it was put off to', () => {
        const job = enqueued(after(1));

        expect(job.isDue(NOW)).toBe(false);
        expect(job.isDue(after(1))).toBe(true);
        expect(() =>
            job.take({ leaseId: 'lease-1', maxAttempts: 3, now: NOW }),
        ).toThrow(expect.objectContaining({ code: 'JOBS_JOB_NOT_DUE' }));
    });

    it('counts the attempt when it is taken, not when it fails', () => {
        const job = enqueued();

        const outcome = job.take({
            leaseId: 'lease-1',
            maxAttempts: POLICY.maxAttempts,
            now: NOW,
        });

        expect(outcome).toBe('taken');
        expect(job.view()).toMatchObject({
            state: 'running',
            attempts: 1,
            leaseId: 'lease-1',
            leaseExpiresAt: after(LEASE_MS),
        });
    });

    it('stays with its executor until the lease runs out', () => {
        const job = taken();

        expect(job.isDue(after(LEASE_MS - 1))).toBe(false);
        expect(job.isDue(after(LEASE_MS))).toBe(true);
    });

    it('passes to another executor once the lease has run out', () => {
        const job = taken('lease-1');

        const outcome = job.take({
            leaseId: 'lease-2',
            maxAttempts: POLICY.maxAttempts,
            now: after(LEASE_MS),
        });

        expect(outcome).toBe('taken');
        expect(job.view()).toMatchObject({
            attempts: 2,
            leaseId: 'lease-2',
            leaseExpiresAt: after(LEASE_MS * 2),
        });
        expect(job.isHeldBy('lease-1')).toBe(false);
        expect(job.isHeldBy('lease-2')).toBe(true);
    });

    it('refuses the executor that lost the lease', () => {
        const job = taken('lease-1');
        job.take({
            leaseId: 'lease-2',
            maxAttempts: POLICY.maxAttempts,
            now: after(LEASE_MS),
        });
        const lost: unknown = expect.objectContaining({
            code: 'JOBS_LEASE_LOST',
        });

        expect(() => job.complete('lease-1')).toThrow(lost);
        expect(() => job.renew('lease-1', NOW)).toThrow(lost);
        expect(() => job.release('lease-1', NOW)).toThrow(lost);
        expect(() =>
            job.fail('lease-1', { policy: POLICY, jitter: 0, now: NOW }),
        ).toThrow(lost);
    });

    it('dies instead of running when a crashed executor spent the last attempt', () => {
        const job = running({ attempts: POLICY.maxAttempts });

        const outcome = job.take({
            leaseId: 'lease-2',
            maxAttempts: POLICY.maxAttempts,
            now: after(LEASE_MS),
        });

        expect(outcome).toBe('exhausted');
        expect(job.view()).toMatchObject({
            state: 'dead',
            attempts: POLICY.maxAttempts,
            leaseId: null,
            leaseExpiresAt: null,
        });
        expect(job.isDue(after(LEASE_MS * 10))).toBe(false);
    });

    it('extends the lease from the moment of renewal', () => {
        const job = taken();

        job.renew('lease-1', after(20_000));

        expect(job.view().leaseExpiresAt).toEqual(after(20_000 + LEASE_MS));
        expect(job.view().attempts).toBe(1);
    });

    it('asks for renewal when half of the lease is spent', () => {
        const leaseExpiresAt = after(LEASE_MS);

        expect(leaseNeedsRenewal(leaseExpiresAt, after(LEASE_MS / 2 - 1))).toBe(
            false,
        );
        expect(leaseNeedsRenewal(leaseExpiresAt, after(LEASE_MS / 2))).toBe(
            true,
        );
    });

    it('has the lease checked well before renewal is due, however rare the polling', () => {
        expect(leaseCheckIntervalMs(60_000)).toBeLessThan(LEASE_MS / 2);
        expect(leaseCheckIntervalMs(60_000)).toBe(leaseCheckIntervalMs(5000));
        expect(leaseCheckIntervalMs(20)).toBe(20);
    });

    it('waits for a retry after a failure, longer each time', () => {
        const job = taken();

        const first = job.fail('lease-1', {
            policy: POLICY,
            jitter: 0,
            now: NOW,
        });

        expect(first).toBe('waiting');
        expect(job.view()).toMatchObject({
            state: 'waiting',
            attempts: 1,
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: after(1000),
        });

        job.take({ leaseId: 'lease-2', maxAttempts: 3, now: after(1000) });
        job.fail('lease-2', { policy: POLICY, jitter: 0, now: after(1000) });

        expect(job.view().availableAt).toEqual(after(1000 + 2000));
    });

    it('dies when the last attempt fails', () => {
        const job = running({ attempts: POLICY.maxAttempts });

        const state = job.fail('lease-1', {
            policy: POLICY,
            jitter: 0,
            now: NOW,
        });

        expect(state).toBe('dead');
        expect(job.view()).toMatchObject({
            state: 'dead',
            attempts: POLICY.maxAttempts,
            leaseId: null,
            leaseExpiresAt: null,
        });
    });

    it('gives the attempt back when it is released', () => {
        const job = taken();

        job.release('lease-1', after(5000));

        expect(job.view()).toMatchObject({
            state: 'waiting',
            attempts: 0,
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: after(5000),
        });
    });
});
