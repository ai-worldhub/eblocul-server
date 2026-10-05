import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../shared/db/tx.ts';
import { Ids } from '../../../shared/ids/ids.service.ts';
import type { JobDefinition, JobPayload } from '../domain/job-definition.ts';
import { JobEntity } from '../domain/job.entity.ts';
import { JobRepository } from '../ports/job.repository.ts';

export type EnqueueOptions = {
    notBefore?: Date;
    dedupKey?: string;
};

@Injectable()
export class JobQueueService {
    constructor(
        private readonly _jobs: JobRepository,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
    ) {}

    async enqueue<P extends JobPayload>(
        tx: Tx,
        job: JobDefinition<P>,
        payload: NoInfer<P>,
        options: EnqueueOptions = {},
    ): Promise<void> {
        await this._jobs.add(
            tx,
            JobEntity.enqueue({
                id: this._ids.next(),
                kind: job.kind,
                class: job.class,
                payload,
                dedupKey: options.dedupKey ?? null,
                notBefore: options.notBefore ?? null,
                now: this._clock.now(),
            }),
        );
    }
}
