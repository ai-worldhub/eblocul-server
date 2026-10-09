import { type DynamicModule, Module } from '@nestjs/common';
import {
    JOB_HANDLER_TYPES,
    JobHandlerRegistry,
} from './application/job-handler-registry.service.ts';
import { JobRunnerService } from './application/job-runner.service.ts';
import { JobWorkerService } from './application/job-worker.service.ts';
import { MathRetryJitter } from './infrastructure/node/math-retry-jitter.ts';
import { NodeWorkerProcess } from './infrastructure/node/node-worker-process.ts';
import { JobsModule } from './jobs.module.ts';
import type { JobHandlerType } from './ports/job-handler.port.ts';
import { RetryJitter } from './ports/retry-jitter.port.ts';
import { WorkerProcess } from './ports/worker-process.port.ts';

@Module({})
export class JobsWorkerModule {
    static register(handlers: readonly JobHandlerType[]): DynamicModule {
        return {
            module: JobsWorkerModule,
            imports: [JobsModule],
            providers: [
                { provide: JOB_HANDLER_TYPES, useValue: handlers },
                { provide: RetryJitter, useClass: MathRetryJitter },
                { provide: WorkerProcess, useClass: NodeWorkerProcess },
                JobHandlerRegistry,
                JobRunnerService,
                JobWorkerService,
            ],
        };
    }
}
