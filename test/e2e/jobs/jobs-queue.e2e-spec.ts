import { PAYLOAD_MAX_BYTES } from '../../../src/core/jobs/domain/job-definition.ts';
import { JobQueueService } from '../../../src/core/jobs/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { BARRIER_JOB, PROBE_JOB } from '../../utils/job-handler.double.ts';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const LATER = new Date('2026-10-05T12:00:00.000Z');

class Refused extends Error {}

describe('Jobs queue (e2e)', () => {
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(new ClockDouble(NOW)),
    );

    const transactions = (): Transactions => testApp.app.get(Transactions);
    const queue = (): JobQueueService => testApp.app.get(JobQueueService);

    it('stores the job as it was enqueued', async () => {
        await transactions().run((tx) =>
            queue().enqueue(
                tx,
                PROBE_JOB,
                { label: 'first' },
                { notBefore: LATER, dedupKey: 'unit-1' },
            ),
        );

        const { id, ...stored } = await testApp.db.job.findFirstOrThrow();
        expect(id).toEqual(expect.any(String));
        expect(stored).toEqual({
            kind: 'probe.work',
            class: 'p1',
            state: 'waiting',
            payload: { label: 'first' },
            dedupKey: 'unit-1',
            attempts: 0,
            leaseId: null,
            createdAt: NOW,
            availableAt: LATER,
            leaseExpiresAt: null,
        });
        expect(await testApp.db.job.count()).toBe(1);
    });

    it('makes the job available at once when no time is given', async () => {
        await transactions().run((tx) =>
            queue().enqueue(tx, PROBE_JOB, { label: 'now' }),
        );

        const job = await testApp.db.job.findFirstOrThrow();
        expect(job.availableAt).toEqual(NOW);
        expect(job.dedupKey).toBeNull();
    });

    it('leaves no job when the transaction rolls back', async () => {
        await expect(
            transactions().run(async (tx) => {
                await queue().enqueue(tx, PROBE_JOB, { label: 'lost' });
                throw new Refused('no');
            }),
        ).rejects.toBeInstanceOf(Refused);

        expect(await testApp.db.job.count()).toBe(0);
    });

    it('refuses a payload over the limit and rolls the transaction back', async () => {
        const userId = testApp.app.get(Ids).next();

        await expect(
            transactions().run(async (tx) => {
                await tx.user.create({
                    data: { id: userId },
                    select: { id: true },
                });
                await queue().enqueue(tx, PROBE_JOB, {
                    label: 'x'.repeat(PAYLOAD_MAX_BYTES),
                });
            }),
        ).rejects.toMatchObject({ code: 'JOBS_PAYLOAD_TOO_LARGE' });

        expect(await testApp.db.job.count()).toBe(0);
        expect(await testApp.db.user.count({ where: { id: userId } })).toBe(0);
    });

    it('ignores a second job of the same kind with the same key', async () => {
        const userId = testApp.app.get(Ids).next();

        await transactions().run((tx) =>
            queue().enqueue(
                tx,
                PROBE_JOB,
                { label: 'first' },
                { dedupKey: 'unit-1' },
            ),
        );
        await transactions().run(async (tx) => {
            await queue().enqueue(
                tx,
                PROBE_JOB,
                { label: 'second' },
                { dedupKey: 'unit-1' },
            );
            await tx.user.create({
                data: { id: userId },
                select: { id: true },
            });
        });

        const jobs = await testApp.db.job.findMany();
        expect(jobs.map((job) => job.payload)).toEqual([{ label: 'first' }]);
        expect(await testApp.db.user.count({ where: { id: userId } })).toBe(1);
    });

    it('keeps jobs that share a key but not a kind, and jobs without a key', async () => {
        await transactions().run(async (tx) => {
            await queue().enqueue(
                tx,
                PROBE_JOB,
                { label: 'probe' },
                { dedupKey: 'unit-1' },
            );
            await queue().enqueue(
                tx,
                BARRIER_JOB,
                { label: 'barrier' },
                { dedupKey: 'unit-1' },
            );
            await queue().enqueue(tx, PROBE_JOB, { label: 'free' });
            await queue().enqueue(tx, PROBE_JOB, { label: 'free' });
        });

        expect(await testApp.db.job.count()).toBe(4);
    });
});
