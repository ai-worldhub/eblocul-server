import { Test } from '@nestjs/testing';
import { WorkerModule } from '../../../src/app/worker.module.ts';
import { PurgePhoneCodesHandler } from '../../../src/core/identity/index.ts';
import type { JobRun } from '../../../src/core/jobs/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    codeDoubles,
    confirmSentCode,
    requestCode,
    RESIDENT,
} from '../../utils/resident-session.ts';
import { waitFor } from '../../utils/wait-for.ts';

const NOW = new Date('2026-10-09T10:01:30.000Z');
const FIRST_SLOT = new Date('2026-10-09T10:05:00.000Z');
const CODE_END = new Date('2026-10-09T10:11:30.000Z');
const SLOT_AFTER_CODE_END = new Date('2026-10-09T10:15:00.000Z');
const PURGE_KIND = 'identity.purge_phone_codes';
const OTHER_PHONE = '+37379000002';
const MINUTE_MS = 60_000;

describe('Purge of expired phone codes (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const doubles = codeDoubles();
    const testApp = useTestApp((builder) =>
        doubles.override(builder).overrideProvider(Clock).useValue(clock),
    );

    beforeEach(() => {
        clock.advance(NOW.getTime() - clock.now().getTime());
        doubles.reset();
    });

    const moveTo = (moment: Date): void => {
        clock.advance(moment.getTime() - clock.now().getTime());
    };

    const purge = async (): Promise<void> => {
        const run: JobRun = {
            jobId: '00000000-0000-7000-8000-000000000001',
            attempt: 1,
            signal: new AbortController().signal,
            complete: () => Promise.resolve(),
        };
        await testApp.app.get(PurgePhoneCodesHandler).handle({}, run);
    };

    const purgeSlots = async (): Promise<Date[]> => {
        const jobs = await testApp.db.job.findMany({
            where: { kind: PURGE_KIND },
            orderBy: { availableAt: 'asc' },
        });
        return jobs.map(({ availableAt }) => availableAt);
    };

    it('schedules one purge for the next five-minute slot, however many codes are requested', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        await requestCode(testApp, OTHER_PHONE).expect(200);

        expect(
            await testApp.db.job.findMany({ where: { kind: PURGE_KIND } }),
        ).toMatchObject([
            {
                availableAt: FIRST_SLOT,
                dedupKey: FIRST_SLOT.toISOString(),
                payload: {},
            },
        ]);
    });

    it('keeps a live code, removes it once it has expired and stops when nothing is left', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);

        moveTo(FIRST_SLOT);
        await purge();

        expect(await testApp.db.phoneCode.count()).toBe(1);
        expect(await purgeSlots()).toEqual([
            FIRST_SLOT,
            new Date('2026-10-09T10:10:00.000Z'),
        ]);

        moveTo(CODE_END);
        await purge();

        expect(await testApp.db.phoneCode.count()).toBe(0);
        expect(await purgeSlots()).toHaveLength(2);
    });

    it('keeps a confirmed phone for the thirty minutes it waits for the consent and removes it afterwards', async () => {
        await confirmSentCode(testApp, doubles, RESIDENT.phone);

        moveTo(SLOT_AFTER_CODE_END);
        await purge();
        expect(await testApp.db.pendingSignIn.count()).toBe(1);
        expect(await purgeSlots()).toHaveLength(2);

        clock.advance(17 * MINUTE_MS);
        await purge();
        expect(await testApp.db.pendingSignIn.count()).toBe(0);
        expect(await testApp.db.phoneCode.count()).toBe(0);
    });

    it('is run by the worker, which takes the job off the queue', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        moveTo(SLOT_AFTER_CODE_END);
        const worker = await doubles
            .override(Test.createTestingModule({ imports: [WorkerModule] }))
            .overrideProvider(Clock)
            .useValue(clock)
            .compile();

        await worker.init();
        try {
            await waitFor(
                async () =>
                    (await testApp.db.job.count({
                        where: { kind: PURGE_KIND },
                    })) === 0
                        ? true
                        : null,
                'the purge job to leave the queue',
            );
        } finally {
            await worker.close();
        }

        expect(await testApp.db.phoneCode.count()).toBe(0);
    });
});
