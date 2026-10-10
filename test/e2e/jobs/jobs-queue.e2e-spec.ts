import { PAYLOAD_MAX_BYTES } from '../../../src/core/jobs/domain/job-definition.ts';
import { JobQueueService } from '../../../src/core/jobs/index.ts';
import { JobRepository } from '../../../src/core/jobs/ports/job.repository.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { BARRIER_JOB, PROBE_JOB } from '../../utils/job-handler.double.ts';
import {
    fulfilledValueOf,
    runOverlapped,
} from '../../utils/overlapped-transactions.ts';
import { accountRow } from '../../factories/identity.factory.ts';

const NOW = new Date('2026-10-05T10:00:00.000Z');
const LATER = new Date('2026-10-05T12:00:00.000Z');
const HELD_JOB_ID = '00000000-0000-7000-8000-00000000d001';
const LEASE_ID = '00000000-0000-7000-8000-00000000d002';
const KEY = 'unit-1';

class Refused extends Error {}

describe('Jobs queue (e2e)', () => {
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(new ClockDouble(NOW)),
    );

    const transactions = (): Transactions => testApp.app.get(Transactions);
    const queue = (): JobQueueService => testApp.app.get(JobQueueService);

    const seedKeyHolder = async (
        state: 'running' | 'dead',
        attempts: number,
    ): Promise<void> => {
        await testApp.db.job.create({
            data: {
                id: HELD_JOB_ID,
                kind: PROBE_JOB.kind,
                class: PROBE_JOB.class,
                state,
                payload: { label: 'first' },
                dedupKey: KEY,
                attempts,
                leaseId: state === 'running' ? LEASE_ID : null,
                createdAt: NOW,
                availableAt: NOW,
                leaseExpiresAt: state === 'running' ? LATER : null,
            },
            select: { id: true },
        });
    };

    const enqueueWithKey = (label: string): Promise<void> =>
        transactions().run((tx) =>
            queue().enqueue(tx, PROBE_JOB, { label }, { dedupKey: KEY }),
        );

    const failWhileEnqueueing = async (label: string): Promise<void> => {
        const repository = testApp.app.get(JobRepository);
        const { second } = await runOverlapped({
            db: testApp.db,
            transactions: transactions(),
            first: async (tx) => {
                const job = await repository.lockById(tx, HELD_JOB_ID);
                job?.fail(LEASE_ID, {
                    policy: PROBE_JOB.retry,
                    jitter: 0,
                    now: NOW,
                });
                if (job !== null) {
                    await repository.save(tx, job);
                }
            },
            second: (tx) =>
                queue().enqueue(tx, PROBE_JOB, { label }, { dedupKey: KEY }),
        });
        fulfilledValueOf(second);
    };

    const storedJobs = async (): Promise<
        { state: string; payload: unknown; dedupKey: string | null }[]
    > => {
        const jobs = await testApp.db.job.findMany({
            orderBy: [{ state: 'asc' }, { id: 'asc' }],
        });
        return jobs.map(({ state, payload, dedupKey }) => ({
            state,
            payload,
            dedupKey,
        }));
    };

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
        const accountId = testApp.app.get(Ids).next();

        await expect(
            transactions().run(async (tx) => {
                await tx.account.create({
                    data: accountRow.build({ id: accountId }),
                    select: { id: true },
                });
                await queue().enqueue(tx, PROBE_JOB, {
                    label: 'x'.repeat(PAYLOAD_MAX_BYTES),
                });
            }),
        ).rejects.toMatchObject({ code: 'JOBS_PAYLOAD_TOO_LARGE' });

        expect(await testApp.db.job.count()).toBe(0);
        expect(
            await testApp.db.account.count({ where: { id: accountId } }),
        ).toBe(0);
    });

    it('ignores a second job of the same kind with the same key', async () => {
        const accountId = testApp.app.get(Ids).next();

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
            await tx.account.create({
                data: accountRow.build({ id: accountId }),
                select: { id: true },
            });
        });

        const jobs = await testApp.db.job.findMany();
        expect(jobs.map((job) => job.payload)).toEqual([{ label: 'first' }]);
        expect(
            await testApp.db.account.count({ where: { id: accountId } }),
        ).toBe(1);
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

    it('ignores a job with the key of a job that is being run', async () => {
        await seedKeyHolder('running', 1);

        await enqueueWithKey('second');

        expect(await storedJobs()).toEqual([
            { state: 'running', payload: { label: 'first' }, dedupKey: KEY },
        ]);
    });

    it('accepts a job with the key of a dead job and keeps the dead one as it was', async () => {
        await seedKeyHolder('dead', PROBE_JOB.retry.maxAttempts);

        await enqueueWithKey('second');
        await enqueueWithKey('third');

        expect(await storedJobs()).toEqual([
            { state: 'waiting', payload: { label: 'second' }, dedupKey: KEY },
            { state: 'dead', payload: { label: 'first' }, dedupKey: KEY },
        ]);
    });

    it('creates the job that was enqueued while the holder of its key was dying', async () => {
        await seedKeyHolder('running', PROBE_JOB.retry.maxAttempts);

        await failWhileEnqueueing('second');

        expect(await storedJobs()).toEqual([
            { state: 'waiting', payload: { label: 'second' }, dedupKey: KEY },
            { state: 'dead', payload: { label: 'first' }, dedupKey: KEY },
        ]);
    });

    it('creates no second job while the holder of its key fails and stays alive', async () => {
        await seedKeyHolder('running', 1);

        await failWhileEnqueueing('second');

        expect(await storedJobs()).toEqual([
            { state: 'waiting', payload: { label: 'first' }, dedupKey: KEY },
        ]);
    });
});
