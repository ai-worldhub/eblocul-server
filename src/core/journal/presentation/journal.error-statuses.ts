import type { JournalErrorCode } from '../domain/journal.errors.ts';

export const JOURNAL_ERROR_STATUSES = {
    JOURNAL_ACTION_INVALID: 500,
    JOURNAL_ACTION_REPEATED: 500,
    JOURNAL_ENTRY_INVALID: 500,
    JOURNAL_NODE_NOT_FOUND: 500,
    JOURNAL_ACTION_UNKNOWN: 400,
    JOURNAL_PERIOD_INVALID: 400,
} satisfies Record<JournalErrorCode, number>;
