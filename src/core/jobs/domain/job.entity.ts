import type { JobClass } from './job-class.ts';
import type { JobPayload } from './job-definition.ts';
import { JobsError } from './jobs.errors.ts';
import { type RetryPolicy, retryDelayMs } from './retry-policy.ts';

export const LEASE_MS = 30_000;
const LEASE_RENEWAL_SHARE = 0.5;

export type JobState = 'waiting' | 'running' | 'dead';

export type JobSnapshot = {
    id: string;
    kind: string;
    class: JobClass;
    state: JobState;
    payload: JobPayload;
    dedupKey: string | null;
    attempts: number;
    leaseId: string | null;
    createdAt: Date;
    availableAt: Date;
    leaseExpiresAt: Date | null;
};

export type TakeOutcome = 'taken' | 'exhausted';

const after = (moment: Date, durationMs: number): Date =>
    new Date(moment.getTime() + durationMs);

export const leaseNeedsRenewal = (leaseExpiresAt: Date, now: Date): boolean =>
    leaseExpiresAt.getTime() - now.getTime() <= LEASE_MS * LEASE_RENEWAL_SHARE;

export class JobEntity {
    private constructor(private snapshot: JobSnapshot) {}

    static enqueue(input: {
        id: string;
        kind: string;
        class: JobClass;
        payload: JobPayload;
        dedupKey: string | null;
        notBefore: Date | null;
        now: Date;
    }): JobEntity {
        return new JobEntity({
            id: input.id,
            kind: input.kind,
            class: input.class,
            state: 'waiting',
            payload: input.payload,
            dedupKey: input.dedupKey,
            attempts: 0,
            leaseId: null,
            createdAt: input.now,
            availableAt: input.notBefore ?? input.now,
            leaseExpiresAt: null,
        });
    }

    static restore(snapshot: JobSnapshot): JobEntity {
        return new JobEntity(snapshot);
    }

    view(): JobSnapshot {
        return this.snapshot;
    }

    isDue(now: Date): boolean {
        const { state, availableAt, leaseExpiresAt } = this.snapshot;
        if (state === 'waiting') {
            return availableAt.getTime() <= now.getTime();
        }
        return (
            state === 'running' &&
            leaseExpiresAt !== null &&
            leaseExpiresAt.getTime() <= now.getTime()
        );
    }

    isHeldBy(leaseId: string): boolean {
        return (
            this.snapshot.state === 'running' &&
            this.snapshot.leaseId === leaseId
        );
    }

    take(input: {
        leaseId: string;
        maxAttempts: number;
        now: Date;
    }): TakeOutcome {
        if (!this.isDue(input.now)) {
            throw new JobsError('JOBS_JOB_NOT_DUE', 'Job is not due yet', {
                jobId: this.snapshot.id,
            });
        }
        if (this.snapshot.attempts >= input.maxAttempts) {
            this.snapshot = {
                ...this.snapshot,
                state: 'dead',
                leaseId: null,
                leaseExpiresAt: null,
            };
            return 'exhausted';
        }
        this.snapshot = {
            ...this.snapshot,
            state: 'running',
            attempts: this.snapshot.attempts + 1,
            leaseId: input.leaseId,
            leaseExpiresAt: after(input.now, LEASE_MS),
        };
        return 'taken';
    }

    renew(leaseId: string, now: Date): void {
        this.requireHeldBy(leaseId);
        this.snapshot = {
            ...this.snapshot,
            leaseExpiresAt: after(now, LEASE_MS),
        };
    }

    complete(leaseId: string): void {
        this.requireHeldBy(leaseId);
    }

    fail(
        leaseId: string,
        input: { policy: RetryPolicy; jitter: number; now: Date },
    ): JobState {
        this.requireHeldBy(leaseId);
        if (this.snapshot.attempts >= input.policy.maxAttempts) {
            this.snapshot = {
                ...this.snapshot,
                state: 'dead',
                leaseId: null,
                leaseExpiresAt: null,
            };
            return 'dead';
        }
        this.snapshot = {
            ...this.snapshot,
            state: 'waiting',
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: after(
                input.now,
                retryDelayMs(
                    this.snapshot.attempts,
                    input.policy,
                    input.jitter,
                ),
            ),
        };
        return 'waiting';
    }

    release(leaseId: string, now: Date): void {
        this.requireHeldBy(leaseId);
        this.snapshot = {
            ...this.snapshot,
            state: 'waiting',
            attempts: this.snapshot.attempts - 1,
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: now,
        };
    }

    private requireHeldBy(leaseId: string): void {
        if (!this.isHeldBy(leaseId)) {
            throw new JobsError(
                'JOBS_LEASE_LOST',
                'Job is no longer held by this lease',
                { jobId: this.snapshot.id },
            );
        }
    }
}
