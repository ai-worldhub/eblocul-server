import type { Tx } from '../../../shared/db/tx.ts';
import type { JobDefinition, JobPayload } from '../domain/job-definition.ts';

export type JobRun = {
    readonly jobId: string;
    readonly attempt: number;
    readonly signal: AbortSignal;
    complete(tx: Tx): Promise<void>;
};

export abstract class JobHandler<P extends JobPayload = JobPayload> {
    abstract readonly job: JobDefinition<P>;
    abstract handle(payload: P, run: JobRun): Promise<void>;
}

export type JobHandlerType = new (...dependencies: never[]) => JobHandler;
