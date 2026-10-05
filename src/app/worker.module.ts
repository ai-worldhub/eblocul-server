import { Module } from '@nestjs/common';
import { JobsWorkerModule } from '../core/jobs/index.ts';
import { AppModule } from './app.module.ts';
import { JOB_HANDLERS } from './job-handlers.ts';

@Module({
    imports: [AppModule, JobsWorkerModule.register(JOB_HANDLERS)],
})
export class WorkerModule {}
