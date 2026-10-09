import { Injectable } from '@nestjs/common';
import { JobHandler, type JobRun } from '../../../jobs/index.ts';
import { PURGE_PHONE_CODES } from '../identity.jobs.ts';
import { PhoneCodeService } from '../services/phone-code.service.ts';

@Injectable()
export class PurgePhoneCodesHandler extends JobHandler<Record<string, never>> {
    readonly job = PURGE_PHONE_CODES;

    constructor(private readonly _codes: PhoneCodeService) {
        super();
    }

    async handle(_payload: Record<string, never>, run: JobRun): Promise<void> {
        await this._codes.purge(run);
    }
}
