import { CLASS_TIME_LIMITS_MS } from '../../../src/core/jobs/domain/job-class.ts';
import { LEASE_MS } from '../../../src/core/jobs/domain/job.entity.ts';
import { CANCEL_GRACE_MS } from '../../../src/core/jobs/domain/time-limit.ts';
import type { JobRun } from '../../../src/core/jobs/index.ts';
import { accountRow } from '../../factories/identity.factory.ts';
import {
    BARRIER_JOB,
    type JobHandlerDouble,
    PROBE_JOB,
    TIMED_JOB,
    TIMED_LIMIT_MS,
} from '../../utils/job-handler.double.ts';
import { type JobWorker, startJobWorker } from '../../utils/job-worker.ts';
import { waitFor } from '../../utils/wait-for.ts';

const NOW = new Date('2026-10-09T10:00:00.000Z');
const FIRST_RETRY_DELAY_MS = 1000;
const FULL_STOP_TIMEOUT_MS = 30_000;

type Gate = { opened: Promise<void>; open: () => void };

const createGate = (): Gate => {
    let open = (): void => undefined;
    const opened = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { opened, open: () => open() };
};

const after = (moment: Date, durationMs: number): Date =>
    new Date(moment.getTime() + durationMs);

const untilCancelled = (run: JobRun): Promise<void> =>
    new Promise((_resolve, reject) => {
        run.signal.addEventListener('abort', () => {
            reject(
                run.signal.reason instanceof Error
                    ? run.signal.reason
                    : new Error('cancelled'),
            );
        });
    });

describe('Jobs time limit (e2e)', () => {
    let worker: JobWorker;
    let seen: JobRun[];

    beforeEach(async () => {
        worker = await startJobWorker({ now: NOW, loops: false });
        seen = [];
    });

    afterEach(async () => {
        await worker.stop();
    });

    const start = async (
        handler: JobHandlerDouble,
        label: string,
    ): Promise<{ returned: Promise<boolean> }> => {
        const before = handler.runs.length;
        await worker.enqueue(handler.job, label);
        const returned = worker.runner.runNext([handler.job.class]);
        await waitFor(
            () => Promise.resolve(handler.runs.length > before ? true : null),
            'the handler to start',
        );
        return { returned };
    };

    const listening = (handler: JobHandlerDouble): void => {
        handler.behaviour = (_payload, run) => {
            seen.push(run);
            return untilCancelled(run);
        };
    };

    const deaf = (handler: JobHandlerDouble): Gate => {
        const gate = createGate();
        handler.behaviour = (_payload, run) => {
            seen.push(run);
            return gate.opened;
        };
        return gate;
    };

    const pass = async (durationMs: number): Promise<void> => {
        worker.clock.advance(durationMs);
        await worker.runner.enforceTimeLimits();
    };

    const jobOf = (kind: string) =>
        worker.db.job.findFirstOrThrow({ where: { kind } });

    const events = (name: string): unknown[] =>
        worker.events.named(name).map(({ fields }) => fields);

    it('cancels the handler when its time limit runs out, frees the executor and retries the job', async () => {
        listening(worker.timed);
        const { returned } = await start(worker.timed, 'slow');

        await pass(TIMED_LIMIT_MS - 1);
        expect(seen[0]?.signal.aborted).toBe(false);
        await pass(1);

        expect(await returned).toBe(true);
        expect(seen[0]?.signal.reason).toMatchObject({
            code: 'JOBS_TIME_LIMIT_EXCEEDED',
        });
        const job = await jobOf(TIMED_JOB.kind);
        expect(job).toMatchObject({
            state: 'waiting',
            attempts: 1,
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: after(NOW, TIMED_LIMIT_MS + FIRST_RETRY_DELAY_MS),
        });
        expect(events('jobs.job_timed_out')).toEqual([
            {
                jobId: job.id,
                kind: TIMED_JOB.kind,
                attempt: 1,
                limitMs: TIMED_LIMIT_MS,
            },
        ]);
        expect(events('jobs.job_failed')).toHaveLength(1);
        expect(worker.process.terminations).toBe(0);
    });

    it('gives up on the job when its last attempt runs out of time too', async () => {
        listening(worker.timed);
        const first = await start(worker.timed, 'slow');
        await pass(TIMED_LIMIT_MS);
        await first.returned;

        worker.clock.advance(FIRST_RETRY_DELAY_MS);
        const second = worker.runner.runNext(['p1']);
        await waitFor(
            () => Promise.resolve(worker.timed.runs.length === 2 ? true : null),
            'the second attempt to start',
        );
        await pass(TIMED_LIMIT_MS);
        await second;

        const job = await jobOf(TIMED_JOB.kind);
        expect(job).toMatchObject({
            state: 'dead',
            attempts: 2,
            leaseId: null,
        });
        expect(worker.timed.runs).toEqual([
            { label: 'slow', attempt: 1 },
            { label: 'slow', attempt: 2 },
        ]);
        expect(events('jobs.job_dead')).toEqual([
            { jobId: job.id, kind: TIMED_JOB.kind, attempts: 2 },
        ]);
    });

    it('takes the limit of the class when the kind sets none', async () => {
        listening(worker.barrier);
        const { returned } = await start(worker.barrier, 'background');

        await pass(CLASS_TIME_LIMITS_MS.p3 - 1);
        expect(seen[0]?.signal.aborted).toBe(false);
        await pass(1);
        await returned;

        expect(seen[0]?.signal.aborted).toBe(true);
        expect(await jobOf(BARRIER_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 1,
        });
    });

    it('accepts the result of a handler that finishes after the cancel, within the wait', async () => {
        const gate = deaf(worker.timed);
        const { returned } = await start(worker.timed, 'late');

        await pass(TIMED_LIMIT_MS);
        await pass(CANCEL_GRACE_MS - 1);
        gate.open();
        await returned;

        expect(seen[0]?.signal.aborted).toBe(true);
        expect(await worker.db.job.count()).toBe(0);
        expect(events('jobs.job_finished')).toHaveLength(1);
        expect(events('jobs.job_failed')).toEqual([]);
        expect(worker.process.terminations).toBe(0);
    });

    it('counts a failed attempt and stops the process when the handler ignores the cancel', async () => {
        deaf(worker.timed);
        await start(worker.timed, 'hung');

        await pass(TIMED_LIMIT_MS);
        await pass(CANCEL_GRACE_MS - 1);
        expect(worker.process.terminations).toBe(0);
        await pass(1);

        expect(worker.process.terminations).toBe(1);
        const job = await jobOf(TIMED_JOB.kind);
        expect(job).toMatchObject({
            state: 'waiting',
            attempts: 1,
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: after(
                NOW,
                TIMED_LIMIT_MS + CANCEL_GRACE_MS + FIRST_RETRY_DELAY_MS,
            ),
        });
        expect(events('jobs.handler_hung')).toEqual([
            {
                jobId: job.id,
                kind: TIMED_JOB.kind,
                attempt: 1,
                waitedMs: CANCEL_GRACE_MS,
            },
        ]);

        await pass(CANCEL_GRACE_MS);
        expect(worker.process.terminations).toBe(1);
        expect((await jobOf(TIMED_JOB.kind)).attempts).toBe(1);
    });

    it('declares the job dead when the handler that hung had its last attempt', async () => {
        listening(worker.timed);
        const first = await start(worker.timed, 'hung');
        await pass(TIMED_LIMIT_MS);
        await first.returned;
        deaf(worker.timed);
        worker.clock.advance(FIRST_RETRY_DELAY_MS);
        void worker.runner.runNext(['p1']);
        await waitFor(
            () => Promise.resolve(worker.timed.runs.length === 2 ? true : null),
            'the second attempt to start',
        );

        await pass(TIMED_LIMIT_MS);
        await pass(CANCEL_GRACE_MS);

        expect(worker.process.terminations).toBe(1);
        expect(await jobOf(TIMED_JOB.kind)).toMatchObject({
            state: 'dead',
            attempts: 2,
            leaseId: null,
        });
    });

    it('refuses the result of a hung handler that wakes up after its attempt was counted', async () => {
        const accountId = worker.ids.next();
        const gate = createGate();
        const refused: unknown[] = [];
        worker.timed.behaviour = async (_payload, run) => {
            await gate.opened;
            try {
                await worker.transactions.run(async (tx) => {
                    await tx.account.create({
                        data: accountRow.build({ id: accountId }),
                        select: { id: true },
                    });
                    await run.complete(tx);
                });
            } catch (error) {
                refused.push(error);
                throw error;
            }
        };
        const { returned } = await start(worker.timed, 'woken');
        await pass(TIMED_LIMIT_MS);
        await pass(CANCEL_GRACE_MS);

        gate.open();
        await returned;

        expect(refused).toEqual([
            expect.objectContaining({ code: 'JOBS_LEASE_LOST' }),
        ]);
        expect(
            await worker.db.account.count({ where: { id: accountId } }),
        ).toBe(0);
        expect(await jobOf(TIMED_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 1,
        });
        expect(events('jobs.job_failed')).toHaveLength(1);
    });

    it('returns the neighbours of a hung handler without spending their attempts', async () => {
        deaf(worker.timed);
        deaf(worker.probe);
        await start(worker.timed, 'hung');
        await start(worker.probe, 'neighbour');
        await pass(TIMED_LIMIT_MS);
        await pass(CANCEL_GRACE_MS);
        expect(worker.process.terminations).toBe(1);

        worker.runner.stopActive();
        expect(await worker.runner.releaseActive()).toBe(1);

        expect(await jobOf(PROBE_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 0,
            leaseId: null,
            availableAt: after(NOW, TIMED_LIMIT_MS + CANCEL_GRACE_MS),
        });
        expect(await jobOf(TIMED_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 1,
        });
        expect(seen[1]?.signal.reason).toMatchObject({
            code: 'JOBS_WORKER_STOPPING',
        });
    });

    it('counts the attempt of a job that ran out of time before the process was told to stop', async () => {
        deaf(worker.timed);
        deaf(worker.probe);
        await start(worker.timed, 'overdue');
        await start(worker.probe, 'in time');
        await pass(TIMED_LIMIT_MS);

        worker.runner.stopActive();
        expect(await worker.runner.releaseActive()).toBe(2);

        expect(await jobOf(TIMED_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 1,
            availableAt: after(NOW, TIMED_LIMIT_MS + FIRST_RETRY_DELAY_MS),
        });
        expect(await jobOf(PROBE_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 0,
        });
        expect(worker.process.terminations).toBe(0);
    });

    it('counts the attempt when an overdue handler gives in only after the process was told to stop', async () => {
        const gate = createGate();
        worker.timed.behaviour = async (_payload, run) => {
            await gate.opened;
            run.signal.throwIfAborted();
        };
        const { returned } = await start(worker.timed, 'overdue');
        await pass(TIMED_LIMIT_MS);

        worker.runner.stopActive();
        gate.open();
        await returned;

        expect(await jobOf(TIMED_JOB.kind)).toMatchObject({
            state: 'waiting',
            attempts: 1,
            availableAt: after(NOW, TIMED_LIMIT_MS + FIRST_RETRY_DELAY_MS),
        });
        expect(events('jobs.job_released')).toEqual([]);
    });

    it('tells the handler why it is cancelled when the lease is lost', async () => {
        deaf(worker.probe);
        await start(worker.probe, 'overtaken');
        await worker.db.job.updateMany({
            data: { leaseId: worker.ids.next() },
        });

        worker.clock.advance(LEASE_MS - 1);
        await worker.runner.renewLeases();

        expect(seen[0]?.signal.reason).toMatchObject({
            code: 'JOBS_LEASE_LOST',
        });
    });
});

describe('Jobs time limit with running loops (e2e)', () => {
    let worker: JobWorker;
    let other: JobWorker | undefined;

    beforeEach(async () => {
        worker = await startJobWorker({ now: NOW });
        other = undefined;
    });

    afterEach(async () => {
        await worker.stop();
        await other?.stop();
    });

    it(
        'stops the worker whose handler ignores the cancel and lets another worker run both jobs',
        async () => {
            const gate = createGate();
            worker.timed.behaviour = () => gate.opened;
            worker.probe.behaviour = () => gate.opened;
            worker.process.onTerminate = () => {
                void worker.stop();
            };
            await worker.enqueue(TIMED_JOB, 'hung');
            await worker.enqueue(PROBE_JOB, 'neighbour');
            await waitFor(
                async () =>
                    (await worker.db.job.count({
                        where: { state: 'running' },
                    })) === 2
                        ? true
                        : null,
                'both jobs to be running',
            );

            worker.clock.advance(TIMED_LIMIT_MS);
            await waitFor(
                () =>
                    Promise.resolve(
                        worker.events.named('jobs.job_timed_out').length === 1
                            ? true
                            : null,
                    ),
                'the cancel to be sent',
            );
            worker.clock.advance(CANCEL_GRACE_MS);
            await waitFor(
                () =>
                    Promise.resolve(
                        worker.process.terminations === 1 ? true : null,
                    ),
                'the worker to give up on the handler',
            );
            await worker.stop();

            const stoppedAt = worker.clock.now();
            other = await startJobWorker({
                now: stoppedAt,
                loops: false,
                clean: false,
            });
            expect(
                await other.db.job.findMany({ orderBy: { kind: 'asc' } }),
            ).toMatchObject([
                {
                    kind: TIMED_JOB.kind,
                    state: 'waiting',
                    attempts: 1,
                    leaseId: null,
                    availableAt: after(stoppedAt, FIRST_RETRY_DELAY_MS),
                },
                {
                    kind: PROBE_JOB.kind,
                    state: 'waiting',
                    attempts: 0,
                    leaseId: null,
                    availableAt: stoppedAt,
                },
            ]);
            expect(worker.events.named('jobs.worker_stopped')).toEqual([
                { event: 'jobs.worker_stopped', fields: { abandoned: 1 } },
            ]);

            expect(await other.runner.runNext(['p1'])).toBe(true);
            expect(await other.runner.runNext(['p1'])).toBe(false);
            other.clock.advance(FIRST_RETRY_DELAY_MS);
            expect(await other.runner.runNext(['p1'])).toBe(true);

            expect(other.probe.runs).toEqual([
                { label: 'neighbour', attempt: 1 },
            ]);
            expect(other.timed.runs).toEqual([{ label: 'hung', attempt: 2 }]);
            expect(await other.db.job.count()).toBe(0);
        },
        FULL_STOP_TIMEOUT_MS,
    );
});
