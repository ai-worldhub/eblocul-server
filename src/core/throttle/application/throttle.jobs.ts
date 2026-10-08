import { defineJob } from '../../jobs/index.ts';

export const PURGE_EXPIRED = defineJob<Record<string, never>>({
    kind: 'throttle.purge_expired',
    class: 'p4_short',
});
