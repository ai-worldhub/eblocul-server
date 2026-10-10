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
import { JobRepository } from '../../src/core/jobs/ports/job.repository.ts';
import { RetryJitter } from '../../src/core/jobs/ports/retry-jitter.port.ts';
import { WorkerProcess } from '../../src/core/jobs/ports/worker-process.port.ts';
import { Clock } from '../../src/shared/clock/clock.service.ts';
import { DbService } from '../../src/shared/db/db.service.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import { Ids } from '../../src/shared/ids/ids.service.ts';
import { EventLogger } from '../../src/shared/logging/event-logger.ts';
import { cleanDatabase } from './clean-database.ts';
import { ClockDouble } from './clock.double.ts';
import { EventLoggerDouble } from './event-logger.double.ts';
import {
    BarrierHandlerDouble,
    type JobHandlerDouble,
    ProbeHandlerDouble,
    type ProbePayload,
    TimedHandlerDouble,
} from './job-handler.double.ts';
import { JobRepositoryDouble } from './job-repository.double.ts';
import { RetryJitterDouble } from './retry-jitter.double.ts';
import { WorkerProcessDouble } from './worker-process.double.ts';

export type JobWorker = {
    clock: ClockDouble;
    db: DbService;
    ids: Ids;
    transactions: Transactions;
    runner: JobRunnerService;
    repository: JobRepositoryDouble;
    process: WorkerProcessDouble;
    events: EventLoggerDouble;
    probe: JobHandlerDouble;
    barrier: JobHandlerDouble;
    timed: JobHandlerDouble;
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
    clean?: boolean;
};

export const startJobWorker = async (
    options: JobWorkerOptions,
): Promise<JobWorker> => {
    const clock = new ClockDouble(options.now);
    const probe = new ProbeHandlerDouble();
    const barrier = new BarrierHandlerDouble();
    const timed = new TimedHandlerDouble();
    const repository = new JobRepositoryDouble();
    const process = new WorkerProcessDouble();
    const events = new EventLoggerDouble();

    const builder = Test.createTestingModule({
        imports: [
            AppModule,
            JobsWorkerModule.register([
                ProbeHandlerDouble,
                BarrierHandlerDouble,
                TimedHandlerDouble,
            ]),
        ],
        providers: [
            { provide: ProbeHandlerDouble, useValue: probe },
            { provide: BarrierHandlerDouble, useValue: barrier },
            { provide: TimedHandlerDouble, useValue: timed },
        ],
    })
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(RetryJitter)
        .useValue(new RetryJitterDouble(0))
        .overrideProvider(JobRepository)
        .useValue(repository)
        .overrideProvider(WorkerProcess)
        .useValue(process)
        .overrideProvider(EventLogger)
        .useValue(events);
    const moduleRef = await (
        options.loops === false
            ? builder.overrideProvider(JobWorkerService).useValue({})
            : builder
    ).compile();

    const db = moduleRef.get(DbService);
    if (options.clean !== false) {
        await cleanDatabase(db);
    }
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
        repository,
        process,
        events,
        probe,
        barrier,
        timed,
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
