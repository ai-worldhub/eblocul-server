import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { JobHandlerRegistry } from '../../../src/core/jobs/application/job-handler-registry.service.ts';
import { JobRunnerService } from '../../../src/core/jobs/application/job-runner.service.ts';
import { JobWorkerService } from '../../../src/core/jobs/application/job-worker.service.ts';
import { LEASE_MS } from '../../../src/core/jobs/domain/job.entity.ts';
import { EventLogger } from '../../../src/shared/logging/event-logger.ts';

const POLL_INTERVAL_MAX_MS = 60_000;
const POLL_INTERVAL_SHORT_MS = 1000;

type Worker = {
    moduleRef: TestingModule;
    checkedAt: number[];
    enforcedAt: number[];
};

const startWorker = async (pollIntervalMs: number): Promise<Worker> => {
    const checkedAt: number[] = [];
    const enforcedAt: number[] = [];
    const moduleRef = await Test.createTestingModule({
        providers: [
            JobWorkerService,
            {
                provide: ConfigService,
                useValue: new ConfigService({
                    JOBS_WORKER_CONCURRENCY: 1,
                    JOBS_POLL_INTERVAL_MS: pollIntervalMs,
                }),
            },
            {
                provide: JobRunnerService,
                useValue: {
                    runNext: () => Promise.resolve(false),
                    enforceTimeLimits: () => {
                        enforcedAt.push(Date.now());
                        return Promise.resolve();
                    },
                    renewLeases: () => {
                        checkedAt.push(Date.now());
                        return Promise.resolve();
                    },
                    stopActive: () => undefined,
                    releaseActive: () => Promise.resolve(0),
                },
            },
            { provide: JobHandlerRegistry, useValue: { kinds: () => [] } },
            {
                provide: EventLogger,
                useValue: { info: () => undefined, error: () => undefined },
            },
        ],
    }).compile();
    await moduleRef.init();
    return { moduleRef, checkedAt, enforcedAt };
};

const longestGap = (moments: number[]): number =>
    Math.max(
        ...moments
            .slice(1)
            .map((moment, index) => moment - (moments[index] ?? moment)),
    );

describe('JobWorkerService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('checks leases in time to renew them when jobs are polled rarely', async () => {
        const { moduleRef, checkedAt } =
            await startWorker(POLL_INTERVAL_MAX_MS);

        await vi.advanceTimersByTimeAsync(LEASE_MS * 2);
        await moduleRef.close();

        expect(checkedAt.length).toBeGreaterThan(1);
        expect(longestGap(checkedAt)).toBeLessThan(LEASE_MS / 2);
    });

    it('checks leases as often as it polls when it polls often', async () => {
        const { moduleRef, checkedAt } = await startWorker(
            POLL_INTERVAL_SHORT_MS,
        );

        await vi.advanceTimersByTimeAsync(LEASE_MS);
        await moduleRef.close();

        expect(longestGap(checkedAt)).toBe(POLL_INTERVAL_SHORT_MS);
    });

    it('checks time limits at every lease check', async () => {
        const { moduleRef, checkedAt, enforcedAt } = await startWorker(
            POLL_INTERVAL_SHORT_MS,
        );

        await vi.advanceTimersByTimeAsync(LEASE_MS);
        await moduleRef.close();

        expect(enforcedAt.length).toBeGreaterThan(1);
        expect(enforcedAt).toEqual(checkedAt);
    });
});
