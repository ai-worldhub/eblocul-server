import { defineJob } from '../../jobs/index.ts';

export const PURGE_PHONE_CODES = defineJob<Record<string, never>>({
    kind: 'identity.purge_phone_codes',
    class: 'p4_short',
});
