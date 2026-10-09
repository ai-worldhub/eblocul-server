export type JournalRefusalCode =
    'JOURNAL_ACTION_UNKNOWN' | 'JOURNAL_PERIOD_INVALID';

export type JournalFaultCode =
    | 'JOURNAL_ACTION_INVALID'
    | 'JOURNAL_ACTION_REPEATED'
    | 'JOURNAL_ACTION_NOT_REGISTERED'
    | 'JOURNAL_ENTRY_INVALID'
    | 'JOURNAL_NODE_NOT_FOUND';

export type JournalErrorCode = JournalRefusalCode | JournalFaultCode;

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
