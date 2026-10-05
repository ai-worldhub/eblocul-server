import { Module } from '@nestjs/common';
import { JobQueueService } from './application/job-queue.service.ts';
import { PrismaJobRepository } from './infrastructure/prisma/job.repository.ts';
import { JobRepository } from './ports/job.repository.ts';

@Module({
    providers: [
        JobQueueService,
        { provide: JobRepository, useClass: PrismaJobRepository },
    ],
    exports: [JobQueueService, JobRepository],
})
export class JobsModule {}
