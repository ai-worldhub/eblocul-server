import { Test } from '@nestjs/testing';
import { WorkerModule } from '../../../src/app/worker.module.ts';
import { PurgeExpiredHandler } from '../../../src/core/throttle/index.ts';
import type { JobRun } from '../../../src/core/jobs/index.ts';
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
import { waitFor } from '../../utils/wait-for.ts';

const NOW = new Date('2026-10-08T10:01:30.000Z');
const FIRST_SLOT = new Date('2026-10-08T10:05:00.000Z');
const SECOND_SLOT = new Date('2026-10-08T10:10:00.000Z');
const LOCK_END = new Date('2026-10-08T10:16:30.000Z');
const PURGE_KIND = 'throttle.purge_expired';
const MAX_FAILURES = 5;

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

    const purge = async (): Promise<void> => {
        const run: JobRun = {
            jobId: '00000000-0000-7000-8000-000000000001',
            attempt: 1,
            signal: new AbortController().signal,
            complete: () => Promise.resolve(),
        };
        await testApp.app.get(PurgeExpiredHandler).handle({}, run);
    };

    const purgeJobs = (): Promise<
        { availableAt: Date; dedupKey: string | null }[]
    > =>
        testApp.db.job.findMany({
            where: { kind: PURGE_KIND },
            orderBy: { availableAt: 'asc' },
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
});
