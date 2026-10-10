import { PurgePhoneCodesHandler } from '../core/identity/index.ts';
import type { JobHandlerType } from '../core/jobs/index.ts';
import { PurgeExpiredHandler } from '../core/throttle/index.ts';

export const JOB_HANDLERS: readonly JobHandlerType[] = [
    PurgeExpiredHandler,
    PurgePhoneCodesHandler,
];
