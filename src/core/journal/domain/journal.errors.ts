export type JournalErrorCode =
    | 'JOURNAL_ACTION_INVALID'
    | 'JOURNAL_ACTION_REPEATED'
    | 'JOURNAL_ENTRY_INVALID'
    | 'JOURNAL_NODE_NOT_FOUND'
    | 'JOURNAL_ACTION_UNKNOWN'
    | 'JOURNAL_PERIOD_INVALID';

export class JournalError extends Error {
    constructor(
        readonly code: JournalErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'JournalError';
    }
}
