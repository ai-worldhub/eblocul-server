import { Test } from '@nestjs/testing';
import { WorkerModule } from '../../../src/app/worker.module.ts';
import { PurgeExpiredHandler } from '../../../src/core/throttle/index.ts';
import type { JobRun } from '../../../src/core/jobs/index.ts';
import { CANCEL_GRACE_MS } from '../../../src/core/jobs/domain/time-limit.ts';
import { WorkerProcess } from '../../../src/core/jobs/ports/worker-process.port.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import {
    ADMIN,
    createAdmin,
    LOGIN_PATH,
    PANEL_ORIGIN,
    signIn,
} from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    CUT_OFF_BY_STATEMENT_LIMIT,
    holdLock,
    type HeldLock,
} from '../../utils/held-lock.ts';
import { waitFor } from '../../utils/wait-for.ts';
import { WorkerProcessDouble } from '../../utils/worker-process.double.ts';

const NOW = new Date('2026-10-08T10:01:30.000Z');
const FIRST_SLOT = new Date('2026-10-08T10:05:00.000Z');
const SECOND_SLOT = new Date('2026-10-08T10:10:00.000Z');
const LOCK_END = new Date('2026-10-08T10:16:30.000Z');
const PURGE_KIND = 'throttle.purge_expired';
const MAX_FAILURES = 5;
const SILENT_BATCH_TEST_TIMEOUT_MS = 20_000;

describe('Purge of expired throttle rows (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    beforeEach(() => {
        clock.advance(NOW.getTime() - clock.now().getTime());
    });

    const knock = (): Promise<unknown> =>
        testApp
            .http()
            .post(LOGIN_PATH)
            .set('Origin', PANEL_ORIGIN)
            .send({})
            .expect(400);

    const lockOut = async (): Promise<void> => {
        await createAdmin(testApp);
        for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
            await signIn(testApp, {
                email: ADMIN.email,
                password: 'wrong-password-99',
            });
        }
    };

    const purge = async (
        signal: AbortSignal = new AbortController().signal,
    ): Promise<void> => {
        const run: JobRun = {
            jobId: '00000000-0000-7000-8000-000000000001',
            attempt: 1,
            signal,
            complete: () => Promise.resolve(),
        };
        await testApp.app.get(PurgeExpiredHandler).handle({}, run);
    };

    const holdBuckets = (): Promise<HeldLock> =>
        holdLock(
            testApp.db,
            (tx) =>
                tx.$queryRaw`SELECT 1 FROM throttle.rate_buckets FOR UPDATE`,
        );

    const purgeJobs = (): Promise<
        { state: string; availableAt: Date; dedupKey: string | null }[]
    > =>
        testApp.db.job.findMany({
            where: { kind: PURGE_KIND },
            orderBy: [{ availableAt: 'asc' }, { state: 'desc' }],
        });

    it('schedules one purge for the next five-minute slot, however many requests come', async () => {
        await knock();
        await knock();
        await lockOut();

        expect(await purgeJobs()).toMatchObject([
            {
                availableAt: FIRST_SLOT,
                dedupKey: FIRST_SLOT.toISOString(),
                payload: {},
            },
        ]);
    });

    it('schedules a purge for a slot whose earlier job is dead', async () => {
        await testApp.db.job.create({
            data: {
                id: '00000000-0000-7000-8000-00000000d003',
                kind: PURGE_KIND,
                class: 'p4_short',
                state: 'dead',
                payload: {},
                dedupKey: FIRST_SLOT.toISOString(),
                attempts: 5,
                createdAt: NOW,
                availableAt: FIRST_SLOT,
            },
            select: { id: true },
        });

        await knock();
        await knock();

        expect(
            (await purgeJobs()).map(({ state, availableAt, dedupKey }) => ({
                state,
                availableAt,
                dedupKey,
            })),
        ).toEqual(
            ['dead', 'waiting'].map((state) => ({
                state,
                availableAt: FIRST_SLOT,
                dedupKey: FIRST_SLOT.toISOString(),
            })),
        );
    });

    it('keeps a bucket that is still filling and removes it once it is full again', async () => {
        await knock();
        clock.advance(FIRST_SLOT.getTime() - NOW.getTime());
        await knock();

        await purge();
        expect(await testApp.db.rateBucket.count()).toBe(1);
        clock.advance(SECOND_SLOT.getTime() - FIRST_SLOT.getTime());
        await purge();

        expect(await testApp.db.rateBucket.count()).toBe(0);
    });

    it('keeps a lock until it ends and schedules the next purge while rows remain', async () => {
        await lockOut();

        clock.advance(FIRST_SLOT.getTime() - NOW.getTime());
        await purge();

        expect(await testApp.db.rateBucket.count()).toBe(0);
        expect(await testApp.db.attemptSeries.count()).toBe(1);
        expect(
            (await purgeJobs()).map(({ availableAt }) => availableAt),
        ).toEqual([FIRST_SLOT, SECOND_SLOT]);

        clock.advance(LOCK_END.getTime() - FIRST_SLOT.getTime());
        await purge();

        expect(await testApp.db.attemptSeries.count()).toBe(0);
        expect(await purgeJobs()).toHaveLength(2);
    });

    it('is run by the worker, which takes the job off the queue', async () => {
        await knock();
        clock.advance(FIRST_SLOT.getTime() - NOW.getTime());
        const worker = await Test.createTestingModule({
            imports: [WorkerModule],
        })
            .overrideProvider(Clock)
            .useValue(clock)
            .compile();

        await worker.init();
        try {
            await waitFor(
                async () =>
                    (await testApp.db.job.count()) === 0 ? true : null,
                'the purge job to leave the queue',
            );
        } finally {
            await worker.close();
        }

        expect(await testApp.db.rateBucket.count()).toBe(0);
    });

    it(
        'gives up a batch that does not answer, sooner than a cancelled handler has to stop, and removes the rows on the next run',
        async () => {
            await knock();
            clock.advance(SECOND_SLOT.getTime() - NOW.getTime());
            const lock = await holdBuckets();
            const cancel = new AbortController();
            let stoppedAfterMs = Number.POSITIVE_INFINITY;

            try {
                const purged = purge(cancel.signal);
                purged.catch(() => undefined);
                await lock.untilSomeoneWaits();
                const cancelledAt = Date.now();
                cancel.abort();
                await expect(purged).rejects.toMatchObject(
                    CUT_OFF_BY_STATEMENT_LIMIT,
                );
                stoppedAfterMs = Date.now() - cancelledAt;
            } finally {
                await lock.release();
            }

            expect(stoppedAfterMs).toBeLessThan(CANCEL_GRACE_MS);
            expect(await testApp.db.rateBucket.count()).toBe(1);
            await purge();
            expect(await testApp.db.rateBucket.count()).toBe(0);
        },
        SILENT_BATCH_TEST_TIMEOUT_MS,
    );

    it(
        'costs the job one attempt and leaves the worker running when a batch does not answer',
        async () => {
            await knock();
            clock.advance(SECOND_SLOT.getTime() - NOW.getTime());
            const process = new WorkerProcessDouble();
            const worker = await Test.createTestingModule({
                imports: [WorkerModule],
            })
                .overrideProvider(Clock)
                .useValue(clock)
                .overrideProvider(WorkerProcess)
                .useValue(process)
                .compile();
            const lock = await holdBuckets();

            await worker.init();
            try {
                await waitFor(
                    async () =>
                        (await testApp.db.job.count({
                            where: {
                                kind: PURGE_KIND,
                                state: 'waiting',
                                attempts: 1,
                            },
                        })) === 1
                            ? true
                            : null,
                    'the purge job to be put back with one attempt spent',
                );
            } finally {
                await lock.release();
                await worker.close();
            }

            expect(process.terminations).toBe(0);
            expect(await testApp.db.rateBucket.count()).toBe(1);
        },
        SILENT_BATCH_TEST_TIMEOUT_MS,
    );
});
