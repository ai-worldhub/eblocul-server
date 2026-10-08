import { Injectable } from '@nestjs/common';
import { JobHandler, type JobRun } from '../../../jobs/index.ts';
import { PurgeService } from '../services/purge.service.ts';
import { PURGE_EXPIRED } from '../throttle.jobs.ts';

@Injectable()
export class PurgeExpiredHandler extends JobHandler<Record<string, never>> {
    readonly job = PURGE_EXPIRED;

    constructor(private readonly _purge: PurgeService) {
        super();
    }

    async handle(_payload: Record<string, never>, run: JobRun): Promise<void> {
        await this._purge.purge(run);
    }
}
