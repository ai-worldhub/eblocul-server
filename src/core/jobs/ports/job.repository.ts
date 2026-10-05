import type { Tx } from '../../../shared/db/tx.ts';
import type { JobClass } from '../domain/job-class.ts';
import type { JobEntity } from '../domain/job.entity.ts';

export type DueJobFilter = {
    kinds: readonly string[];
    classes: readonly JobClass[];
    now: Date;
};

export abstract class JobRepository {
    abstract add(tx: Tx, job: JobEntity): Promise<void>;
    abstract lockNextDue(
        tx: Tx,
        filter: DueJobFilter,
    ): Promise<JobEntity | null>;
    abstract lockById(tx: Tx, jobId: string): Promise<JobEntity | null>;
    abstract save(tx: Tx, job: JobEntity): Promise<void>;
    abstract remove(tx: Tx, job: JobEntity): Promise<void>;
}
