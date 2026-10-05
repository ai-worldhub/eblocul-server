import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.service.ts';
import { Transactions } from '../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../shared/db/tx.ts';
import { Ids } from '../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../shared/logging/event-logger.ts';
import type { JobClass } from '../domain/job-class.ts';
import { JobsError } from '../domain/jobs.errors.ts';
import {
    type JobEntity,
    type JobSnapshot,
    leaseNeedsRenewal,
    type TakeOutcome,
} from '../domain/job.entity.ts';
import { JobRepository } from '../ports/job.repository.ts';
import { RetryJitter } from '../ports/retry-jitter.port.ts';
import { JobHandlerRegistry } from './job-handler-registry.service.ts';
import './jobs.log-events.ts';

type Taken = { outcome: TakeOutcome; job: JobSnapshot; leaseId: string };

type ActiveRun = {
    readonly jobId: string;
    readonly kind: string;
    readonly leaseId: string;
    readonly abort: AbortController;
    readonly completedIn: WeakSet<Tx>;
    hasCompleted: boolean;
    leaseExpiresAt: Date;
    isStopping: boolean;
};

type Held<T> =
    { status: 'held'; result: T } | { status: 'gone' } | { status: 'lost' };

type Handled = { isFailed: false } | { isFailed: true; error: unknown };

@Injectable()
export class JobRunnerService {
    private readonly _active = new Map<string, ActiveRun>();
    private _isStopping = false;

    constructor(
        private readonly _transactions: Transactions,
        private readonly _jobs: JobRepository,
        private readonly _handlers: JobHandlerRegistry,
        private readonly _jitter: RetryJitter,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async runNext(classes: readonly JobClass[]): Promise<boolean> {
        if (this._isStopping) {
            return false;
        }
        const taken = await this._take(classes);
        if (taken === null) {
            return false;
        }
        const { job } = taken;
        if (taken.outcome === 'exhausted') {
            this._events.error('jobs.job_dead', {
                jobId: job.id,
                kind: job.kind,
                attempts: job.attempts,
            });
            return true;
        }
        await this._execute(job, taken.leaseId);
        return true;
    }

    async renewLeases(): Promise<void> {
        const now = this._clock.now();
        const due = [...this._active.values()].filter((run) =>
            leaseNeedsRenewal(run.leaseExpiresAt, now),
        );
        await Promise.all(
            due.map((run) =>
                this._contained(run, 'jobs.lease_renewal_failed', () =>
                    this._renew(run),
                ),
            ),
        );
    }

    stopActive(): void {
        this._isStopping = true;
        for (const run of this._active.values()) {
            run.isStopping = true;
            run.abort.abort();
        }
    }

    async releaseActive(): Promise<number> {
        const released = await Promise.all(
            [...this._active.values()].map((run) =>
                this._contained(run, 'jobs.job_release_failed', () =>
                    this._release(run),
                ),
            ),
        );
        return released.filter((isReleased) => isReleased === true).length;
    }

    private async _take(classes: readonly JobClass[]): Promise<Taken | null> {
        const kinds = this._handlers.kinds();
        if (kinds.length === 0) {
            return null;
        }
        return this._transactions.run(async (tx) => {
            const now = this._clock.now();
            const job = await this._jobs.lockNextDue(tx, {
                kinds,
                classes,
                now,
            });
            if (job === null) {
                return null;
            }
            const leaseId = this._ids.next();
            const { retry } = this._handlers.handlerOf(job.view().kind).job;
            const outcome = job.take({
                leaseId,
                maxAttempts: retry.maxAttempts,
                now,
            });
            await this._jobs.save(tx, job);
            return { outcome, job: job.view(), leaseId };
        });
    }

    private async _execute(job: JobSnapshot, leaseId: string): Promise<void> {
        const run: ActiveRun = {
            jobId: job.id,
            kind: job.kind,
            leaseId,
            abort: new AbortController(),
            completedIn: new WeakSet(),
            hasCompleted: false,
            leaseExpiresAt: job.leaseExpiresAt ?? this._clock.now(),
            isStopping: this._isStopping,
        };
        if (run.isStopping) {
            await this._release(run);
            return;
        }
        this._active.set(run.leaseId, run);
        const startedAt = this._clock.now();
        try {
            const handled = await this._handle(job, run);
            if (!handled.isFailed) {
                await this._finish(run, job, startedAt);
            } else if (run.isStopping) {
                await this._release(run);
            } else {
                await this._fail(run, job, handled.error);
            }
        } finally {
            this._active.delete(run.leaseId);
        }
    }

    private async _handle(job: JobSnapshot, run: ActiveRun): Promise<Handled> {
        try {
            await this._handlers.handlerOf(job.kind).handle(job.payload, {
                jobId: job.id,
                attempt: job.attempts,
                signal: run.abort.signal,
                complete: (tx) => this._completeIn(tx, run),
            });
            return { isFailed: false };
        } catch (error) {
            return { isFailed: true, error };
        }
    }

    private async _completeIn(tx: Tx, run: ActiveRun): Promise<void> {
        if (run.completedIn.has(tx)) {
            return;
        }
        const job = await this._jobs.lockById(tx, run.jobId);
        if (job === null) {
            throw new JobsError(
                'JOBS_LEASE_LOST',
                'Job was finished by another executor',
                { jobId: run.jobId },
            );
        }
        job.complete(run.leaseId);
        await this._jobs.remove(tx, job);
        run.completedIn.add(tx);
        run.hasCompleted = true;
    }

    private async _finish(
        run: ActiveRun,
        job: JobSnapshot,
        startedAt: Date,
    ): Promise<void> {
        const held = await this._whileHeld(run, async (tx, locked) => {
            locked.complete(run.leaseId);
            await this._jobs.remove(tx, locked);
        });
        if (
            held.status === 'lost' ||
            (held.status === 'gone' && !run.hasCompleted)
        ) {
            this._leaseLost(run);
            return;
        }
        this._events.info('jobs.job_finished', {
            jobId: job.id,
            kind: job.kind,
            attempt: job.attempts,
            durationMs: this._clock.now().getTime() - startedAt.getTime(),
        });
    }

    private async _fail(
        run: ActiveRun,
        job: JobSnapshot,
        error: unknown,
    ): Promise<void> {
        this._events.error(
            'jobs.job_failed',
            { jobId: job.id, kind: job.kind, attempt: job.attempts },
            error instanceof Error ? error : undefined,
        );
        const { retry } = this._handlers.handlerOf(job.kind).job;
        const held = await this._whileHeld(run, async (tx, locked) => {
            const state = locked.fail(run.leaseId, {
                policy: retry,
                jitter: this._jitter.next(),
                now: this._clock.now(),
            });
            await this._jobs.save(tx, locked);
            return state;
        });
        if (held.status === 'lost') {
            this._leaseLost(run);
        }
        if (held.status === 'held' && held.result === 'dead') {
            this._events.error('jobs.job_dead', {
                jobId: job.id,
                kind: job.kind,
                attempts: job.attempts,
            });
        }
    }

    private async _release(run: ActiveRun): Promise<boolean> {
        const held = await this._whileHeld(run, async (tx, locked) => {
            locked.release(run.leaseId, this._clock.now());
            await this._jobs.save(tx, locked);
        });
        if (held.status !== 'held') {
            return false;
        }
        this._events.info('jobs.job_released', {
            jobId: run.jobId,
            kind: run.kind,
        });
        return true;
    }

    private async _renew(run: ActiveRun): Promise<void> {
        const held = await this._whileHeld(run, async (tx, locked) => {
            locked.renew(run.leaseId, this._clock.now());
            await this._jobs.save(tx, locked);
            return locked.view().leaseExpiresAt;
        });
        if (held.status === 'lost') {
            this._leaseLost(run);
            run.abort.abort();
        }
        if (held.status === 'held' && held.result !== null) {
            run.leaseExpiresAt = held.result;
        }
    }

    private _whileHeld<T>(
        run: ActiveRun,
        work: (tx: Tx, job: JobEntity) => Promise<T>,
    ): Promise<Held<T>> {
        return this._transactions.run<Held<T>>(async (tx) => {
            const job = await this._jobs.lockById(tx, run.jobId);
            if (job === null) {
                return { status: 'gone' };
            }
            if (!job.isHeldBy(run.leaseId)) {
                return { status: 'lost' };
            }
            return { status: 'held', result: await work(tx, job) };
        });
    }

    private async _contained<T>(
        run: ActiveRun,
        event: 'jobs.lease_renewal_failed' | 'jobs.job_release_failed',
        work: () => Promise<T>,
    ): Promise<T | null> {
        try {
            return await work();
        } catch (error) {
            this._events.error(
                event,
                { jobId: run.jobId, kind: run.kind },
                error instanceof Error ? error : undefined,
            );
            return null;
        }
    }

    private _leaseLost(run: ActiveRun): void {
        this._events.warn('jobs.lease_lost', {
            jobId: run.jobId,
            kind: run.kind,
        });
    }
}
