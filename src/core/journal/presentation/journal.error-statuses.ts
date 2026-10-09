import type { JournalRefusalCode } from '../domain/journal.errors.ts';

export const JOURNAL_ERROR_STATUSES = {
    JOURNAL_ACTION_UNKNOWN: 400,
    JOURNAL_PERIOD_INVALID: 400,
} satisfies Record<JournalRefusalCode, number>;
