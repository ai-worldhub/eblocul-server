import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app/app.module.ts';
import { JobRunnerService } from '../../src/core/jobs/application/job-runner.service.ts';
import { JobWorkerService } from '../../src/core/jobs/application/job-worker.service.ts';
import {
    type JobDefinition,
    JobQueueService,
    JobsWorkerModule,
} from '../../src/core/jobs/index.ts';
import type { EnqueueOptions } from '../../src/core/jobs/index.ts';
import { RetryJitter } from '../../src/core/jobs/ports/retry-jitter.port.ts';
import { Clock } from '../../src/shared/clock/clock.service.ts';
import { DbService } from '../../src/shared/db/db.service.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import { Ids } from '../../src/shared/ids/ids.service.ts';
import { cleanDatabase } from './clean-database.ts';
import { ClockDouble } from './clock.double.ts';
import {
    BarrierHandlerDouble,
    type JobHandlerDouble,
    ProbeHandlerDouble,
    type ProbePayload,
} from './job-handler.double.ts';
import { RetryJitterDouble } from './retry-jitter.double.ts';

export type JobWorker = {
    clock: ClockDouble;
    db: DbService;
    ids: Ids;
    transactions: Transactions;
    runner: JobRunnerService;
    probe: JobHandlerDouble;
    barrier: JobHandlerDouble;
    enqueue: (
        job: JobDefinition<ProbePayload>,
        label: string,
        options?: EnqueueOptions,
    ) => Promise<void>;
    stop: () => Promise<void>;
};

export type JobWorkerOptions = {
    now: Date;
    loops?: boolean;
};

export const startJobWorker = async (
    options: JobWorkerOptions,
): Promise<JobWorker> => {
    const clock = new ClockDouble(options.now);
    const probe = new ProbeHandlerDouble();
    const barrier = new BarrierHandlerDouble();

    const builder = Test.createTestingModule({
        imports: [
            AppModule,
            JobsWorkerModule.register([
                ProbeHandlerDouble,
                BarrierHandlerDouble,
            ]),
        ],
        providers: [
            { provide: ProbeHandlerDouble, useValue: probe },
            { provide: BarrierHandlerDouble, useValue: barrier },
        ],
    })
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(RetryJitter)
        .useValue(new RetryJitterDouble(0));
    const moduleRef = await (
        options.loops === false
            ? builder.overrideProvider(JobWorkerService).useValue({})
            : builder
    ).compile();

    const db = moduleRef.get(DbService);
    await cleanDatabase(db);
    await moduleRef.init();

    const transactions = moduleRef.get(Transactions);
    const queue = moduleRef.get(JobQueueService);
    let stopped: Promise<void> | undefined;

    return {
        clock,
        db,
        ids: moduleRef.get(Ids),
        transactions,
        runner: moduleRef.get(JobRunnerService),
        probe,
        barrier,
        enqueue: (job, label, enqueueOptions) =>
            transactions.run((tx) =>
                queue.enqueue(tx, job, { label }, enqueueOptions),
            ),
        stop: () => {
            stopped ??= moduleRef.close();
            return stopped;
        },
    };
};
