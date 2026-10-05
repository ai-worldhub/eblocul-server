import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import type { JobPayload } from '../../domain/job-definition.ts';
import { JobEntity, type JobSnapshot } from '../../domain/job.entity.ts';
import type {
    DueJobFilter,
    JobRepository,
} from '../../ports/job.repository.ts';
import { JOB_STATE_SELECT, type JobStateRow } from '../job.select.ts';

true satisfies [Omit<JobStateRow, 'payload'>] extends [
    Omit<JobSnapshot, 'payload'>,
]
    ? [Omit<JobSnapshot, 'payload'>] extends [Omit<JobStateRow, 'payload'>]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaJobRepository implements JobRepository {
    async add(tx: Tx, job: JobEntity): Promise<void> {
        await tx.job.createMany({
            data: [job.view()],
            skipDuplicates: true,
        });
    }

    async lockNextDue(tx: Tx, filter: DueJobFilter): Promise<JobEntity | null> {
        const found = await tx.$queryRaw<Found[]>`
            SELECT id
            FROM jobs.jobs
            WHERE kind = ANY(${[...filter.kinds]})
              AND class = ANY(${[...filter.classes]}::jobs.job_class[])
              AND (
                  (state = 'waiting' AND available_at <= ${filter.now})
                  OR (state = 'running' AND lease_expires_at <= ${filter.now})
              )
            ORDER BY class, created_at, id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `;
        return this._load(tx, found);
    }

    async lockById(tx: Tx, jobId: string): Promise<JobEntity | null> {
        const found = await tx.$queryRaw<Found[]>`
            SELECT id
            FROM jobs.jobs
            WHERE id = ${jobId}::uuid
            FOR UPDATE
        `;
        return this._load(tx, found);
    }

    async save(tx: Tx, job: JobEntity): Promise<void> {
        const { id, state, attempts, leaseId, availableAt, leaseExpiresAt } =
            job.view();
        await tx.job.updateMany({
            where: { id },
            data: { state, attempts, leaseId, availableAt, leaseExpiresAt },
        });
    }

    async remove(tx: Tx, job: JobEntity): Promise<void> {
        await tx.job.deleteMany({ where: { id: job.view().id } });
    }

    private async _load(tx: Tx, found: Found[]): Promise<JobEntity | null> {
        const id = found[0]?.id;
        if (id === undefined) {
            return null;
        }
        const row = await tx.job.findUniqueOrThrow({
            where: { id },
            select: JOB_STATE_SELECT,
        });
        return JobEntity.restore({
            ...row,
            payload: row.payload as JobPayload,
        });
    }
}
