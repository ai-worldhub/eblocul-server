import type { JournalAction } from '../core/journal/index.ts';
import {
    ROLE_ASSIGNED,
    ROLE_ENDED,
    ZONE_RETURNED,
    ZONE_TAKEN,
} from '../core/membership/index.ts';

export const JOURNAL_ACTIONS: readonly JournalAction[] = [
    ROLE_ASSIGNED,
    ROLE_ENDED,
    ZONE_TAKEN,
    ZONE_RETURNED,
];
