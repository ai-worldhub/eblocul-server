import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app/app.module.ts';
import { WorkerModule } from '../../../src/app/worker.module.ts';
import { LEASE_MS } from '../../../src/core/jobs/domain/job.entity.ts';
import { JobsError } from '../../../src/core/jobs/domain/jobs.errors.ts';
import { JobHandler, JobsWorkerModule } from '../../../src/core/jobs/index.ts';
import {
    BARRIER_JOB,
    PROBE_JOB,
    type ProbePayload,
    UNKNOWN_JOB,
} from '../../utils/job-handler.double.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { type JobWorker, startJobWorker } from '../../utils/job-worker.ts';
import { waitFor } from '../../utils/wait-for.ts';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const FIRST_RETRY_DELAY_MS = 1000;

class Refused extends Error {}

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

describe('Jobs worker (e2e)', () => {
    let worker: JobWorker;

    beforeEach(async () => {
        worker = await startJobWorker({ now: NOW });
    });

    afterEach(async () => {
        await worker.stop();
    });

    const probeJob = () =>
        worker.db.job.findFirst({ where: { kind: PROBE_JOB.kind } });

    const probeJobIn = (state: string, attempts: number) =>
        waitFor(async () => {
            const job = await probeJob();
            return job?.state === state && job.attempts === attempts
                ? job
                : null;
        }, `the job to be ${state} after ${attempts} attempts`);

    const probeJobGone = () =>
        waitFor(
            async () => ((await probeJob()) === null ? true : null),
            'the job to be removed',
        );

    const passBarrier = async (): Promise<void> => {
        const before = worker.barrier.runs.length;
        await worker.enqueue(BARRIER_JOB, 'barrier');
        await waitFor(
            () =>
                Promise.resolve(
                    worker.barrier.runs.length > before ? true : null,
                ),
            'the barrier job to run',
        );
    };

    const seedRunning = async (input: {
        attempts: number;
        leaseExpiresAt: Date;
    }): Promise<void> => {
        await worker.db.job.create({
            data: {
                id: worker.ids.next(),
                kind: PROBE_JOB.kind,
                class: PROBE_JOB.class,
                state: 'running',
                payload: { label: 'orphan' },
                attempts: input.attempts,
                leaseId: worker.ids.next(),
                createdAt: NOW,
                availableAt: NOW,
                leaseExpiresAt: input.leaseExpiresAt,
            },
            select: { id: true },
        });
    };

    it('removes the job once its handler succeeds', async () => {
        await worker.enqueue(PROBE_JOB, 'done');

        await probeJobGone();
        expect(worker.probe.runs).toEqual([{ label: 'done', attempt: 1 }]);
    });

    it('removes the job in the transaction of its result when the handler completes it there', async () => {
        const userId = worker.ids.next();
        const seen: { inside: number; committed: number }[] = [];
        worker.probe.behaviour = async (_payload, run) => {
            const inside = await worker.transactions.run(async (tx) => {
                await tx.user.create({
                    data: { id: userId },
                    select: { id: true },
                });
                await run.complete(tx);
                return worker.db.job.count();
            });
            seen.push({ inside, committed: await worker.db.job.count() });
        };

        await worker.enqueue(PROBE_JOB, 'atomic');

        await waitFor(
            () => Promise.resolve(seen.length > 0 ? true : null),
            'the handler to return',
        );
        expect(seen).toEqual([{ inside: 1, committed: 0 }]);
        expect(await worker.db.user.count({ where: { id: userId } })).toBe(1);
        await passBarrier();
        expect(worker.probe.runs).toHaveLength(1);
    });

    it('keeps the job when the transaction that completed it rolls back', async () => {
        const userId = worker.ids.next();
        worker.probe.behaviour = (_payload, run) =>
            worker.transactions.run(async (tx) => {
                await tx.user.create({
                    data: { id: userId },
                    select: { id: true },
                });
                await run.complete(tx);
                throw new Refused('no');
            });

        await worker.enqueue(PROBE_JOB, 'rolled back');

        await probeJobIn('waiting', 1);
        expect(await worker.db.user.count({ where: { id: userId } })).toBe(0);
    });

    it('retries a failed job after a delay and gives up when attempts run out', async () => {
        worker.probe.behaviour = () => Promise.reject(new Refused('no'));

        await worker.enqueue(PROBE_JOB, 'failing');

        const retried = await probeJobIn('waiting', 1);
        expect(retried).toMatchObject({
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: after(NOW, FIRST_RETRY_DELAY_MS),
        });
        await passBarrier();
        expect(worker.probe.runs).toHaveLength(1);

        worker.clock.advance(FIRST_RETRY_DELAY_MS);

        const dead = await probeJobIn('dead', 2);
        expect(dead.leaseId).toBeNull();
        expect(worker.probe.runs).toEqual([
            { label: 'failing', attempt: 1 },
            { label: 'failing', attempt: 2 },
        ]);

        worker.clock.advance(LEASE_MS);
        await passBarrier();
        expect(worker.probe.runs).toHaveLength(2);
        expect((await probeJob())?.state).toBe('dead');
    });

    it('hands the job of a crashed executor to another one when its lease runs out', async () => {
        await seedRunning({
            attempts: 1,
            leaseExpiresAt: after(NOW, LEASE_MS),
        });

        await passBarrier();
        expect(worker.probe.runs).toEqual([]);

        worker.clock.advance(LEASE_MS);

        await probeJobGone();
        expect(worker.probe.runs).toEqual([{ label: 'orphan', attempt: 2 }]);
    });

    it('declares the job dead when the executor that crashed spent its last attempt', async () => {
        await seedRunning({
            attempts: PROBE_JOB.retry.maxAttempts,
            leaseExpiresAt: NOW,
        });

        const dead = await probeJobIn('dead', PROBE_JOB.retry.maxAttempts);
        expect(dead).toMatchObject({ leaseId: null, leaseExpiresAt: null });
        expect(worker.probe.runs).toEqual([]);
    });

    it('extends the lease while the handler is still working', async () => {
        const gate = createGate();
        worker.probe.behaviour = () => gate.opened;
        const step = LEASE_MS - 1;

        await worker.enqueue(PROBE_JOB, 'long');
        await probeJobIn('running', 1);

        for (const elapsed of [step, step * 2, step * 3]) {
            worker.clock.advance(step);
            await waitFor(async () => {
                const job = await probeJob();
                return job?.leaseExpiresAt?.getTime() ===
                    after(NOW, elapsed + LEASE_MS).getTime()
                    ? true
                    : null;
            }, 'the lease to be extended');
        }
        await passBarrier();
        expect(worker.probe.runs).toHaveLength(1);

        gate.open();
        await probeJobGone();
    });

    it('leaves a job of an unknown kind untouched', async () => {
        await worker.enqueue(UNKNOWN_JOB, 'from the future');

        await passBarrier();

        const job = await worker.db.job.findFirstOrThrow({
            where: { kind: UNKNOWN_JOB.kind },
        });
        expect(job).toMatchObject({
            state: 'waiting',
            attempts: 0,
            leaseId: null,
            availableAt: NOW,
        });
    });

    it('returns a running job to the queue on shutdown without spending the attempt', async () => {
        worker.probe.behaviour = (_payload, run) =>
            new Promise((_resolve, reject) => {
                run.signal.addEventListener('abort', () => {
                    reject(new Refused('stopped'));
                });
            });

        await worker.enqueue(PROBE_JOB, 'interrupted');
        await probeJobIn('running', 1);

        await worker.stop();

        expect(await probeJob()).toMatchObject({
            state: 'waiting',
            attempts: 0,
            leaseId: null,
            leaseExpiresAt: null,
            availableAt: NOW,
        });
    });

    it('lets a running job finish while the worker is shutting down', async () => {
        const gate = createGate();
        worker.probe.behaviour = () => gate.opened;

        await worker.enqueue(PROBE_JOB, 'finishing');
        await probeJobIn('running', 1);

        const stopped = worker.stop();
        gate.open();
        await stopped;

        expect(await probeJob()).toBeNull();
    });
});

describe('Jobs worker classes (e2e)', () => {
    let worker: JobWorker;

    beforeEach(async () => {
        worker = await startJobWorker({ now: NOW, loops: false });
    });

    afterEach(async () => {
        await worker.stop();
    });

    it('takes only jobs of the classes it was given', async () => {
        await worker.enqueue(PROBE_JOB, 'p1');
        await worker.enqueue(BARRIER_JOB, 'p3');

        expect(await worker.runner.runNext(['p3', 'p4_long'])).toBe(true);
        expect(await worker.runner.runNext(['p3', 'p4_long'])).toBe(false);

        expect(worker.barrier.runs).toHaveLength(1);
        expect(worker.probe.runs).toEqual([]);
    });

    it('takes the higher class first, and the older job within a class', async () => {
        await worker.enqueue(BARRIER_JOB, 'p3');
        await worker.enqueue(PROBE_JOB, 'older');
        await worker.enqueue(PROBE_JOB, 'newer');

        expect(await worker.runner.runNext(['p1', 'p3'])).toBe(true);
        expect(await worker.runner.runNext(['p1', 'p3'])).toBe(true);

        expect(worker.probe.runs.map((run) => run.label)).toEqual([
            'older',
            'newer',
        ]);
        expect(worker.barrier.runs).toEqual([]);
    });

    it('takes nothing once it was told to stop', async () => {
        await worker.enqueue(PROBE_JOB, 'late');

        worker.runner.stopActive();

        expect(await worker.runner.runNext(['p1'])).toBe(false);
        expect(worker.probe.runs).toEqual([]);
        expect(await worker.db.job.findFirstOrThrow()).toMatchObject({
            state: 'waiting',
            attempts: 0,
        });
    });

    it('returns a job taken at the moment of stopping without running it', async () => {
        await worker.enqueue(PROBE_JOB, 'caught');
        worker.clock.onRead = () => {
            worker.runner.stopActive();
        };

        expect(await worker.runner.runNext(['p1'])).toBe(true);

        expect(worker.probe.runs).toEqual([]);
        expect(await worker.db.job.findFirstOrThrow()).toMatchObject({
            state: 'waiting',
            attempts: 0,
            leaseId: null,
            leaseExpiresAt: null,
        });
    });

    it('keeps the lease of the executor that retook a job after the first one returns', async () => {
        const gates = [createGate(), createGate()];
        worker.probe.behaviour = (_payload, run) =>
            gates[run.attempt - 1]?.opened ?? Promise.resolve();
        await worker.enqueue(PROBE_JOB, 'retaken');

        const first = worker.runner.runNext(['p1']);
        await waitFor(
            () => Promise.resolve(worker.probe.runs.length === 1 ? true : null),
            'the first executor to start',
        );
        worker.clock.advance(LEASE_MS);
        const second = worker.runner.runNext(['p1']);
        await waitFor(
            () => Promise.resolve(worker.probe.runs.length === 2 ? true : null),
            'the second executor to start',
        );

        gates[0]?.open();
        await first;
        worker.clock.advance(LEASE_MS - 1);
        await worker.runner.renewLeases();

        expect(await worker.db.job.findFirstOrThrow()).toMatchObject({
            state: 'running',
            attempts: 2,
            leaseExpiresAt: after(NOW, LEASE_MS * 3 - 1),
        });

        gates[1]?.open();
        await second;
        expect(await worker.db.job.count()).toBe(0);
    });

    it('does not take a job before its time', async () => {
        await worker.enqueue(PROBE_JOB, 'later', {
            notBefore: after(NOW, 1),
        });

        expect(await worker.runner.runNext(['p1'])).toBe(false);
        worker.clock.advance(1);
        expect(await worker.runner.runNext(['p1'])).toBe(true);
    });
});

describe('Jobs worker module (e2e)', () => {
    it('starts with the handlers of src/app/job-handlers.ts and stops', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [WorkerModule],
        }).compile();

        await moduleRef.init();
        await moduleRef.close();
    });

    it('refuses to start when two handlers claim one kind', async () => {
        @Injectable()
        class FirstHandler extends JobHandler<ProbePayload> {
            readonly job = PROBE_JOB;

            handle(): Promise<void> {
                return Promise.resolve();
            }
        }

        @Injectable()
        class SecondHandler extends FirstHandler {}

        const moduleRef = await Test.createTestingModule({
            imports: [
                AppModule,
                JobsWorkerModule.register([FirstHandler, SecondHandler]),
            ],
            providers: [FirstHandler, SecondHandler],
        }).compile();

        try {
            await expect(moduleRef.init()).rejects.toMatchObject({
                name: JobsError.name,
                code: 'JOBS_KIND_DUPLICATED',
            });
        } finally {
            await moduleRef.get(DbService).$disconnect();
        }
    });
});
