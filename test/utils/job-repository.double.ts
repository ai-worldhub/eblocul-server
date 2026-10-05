import type { JobEntity } from '../../src/core/jobs/domain/job.entity.ts';
import { PrismaJobRepository } from '../../src/core/jobs/infrastructure/prisma/job.repository.ts';
import type { Tx } from '../../src/shared/db/tx.ts';

export class LockRefused extends Error {}

export class JobRepositoryDouble extends PrismaJobRepository {
    readonly refusedLocks = new Set<string>();

    override lockById(tx: Tx, jobId: string): Promise<JobEntity | null> {
        if (this.refusedLocks.has(jobId)) {
            return Promise.reject(new LockRefused('no'));
        }
        return super.lockById(tx, jobId);
    }
}
