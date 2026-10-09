import { ERROR_STATUSES } from '../../../src/app/error-statuses.ts';
import { JOURNAL_ERROR_STATUSES } from '../../../src/core/journal/index.ts';

const FAULTS = [
    'JOURNAL_ACTION_INVALID',
    'JOURNAL_ACTION_REPEATED',
    'JOURNAL_ACTION_NOT_REGISTERED',
    'JOURNAL_ENTRY_INVALID',
    'JOURNAL_NODE_NOT_FOUND',
];

describe('JOURNAL_ERROR_STATUSES', () => {
    it('gives a status only to what a client can cause', () => {
        expect(JOURNAL_ERROR_STATUSES).toEqual({
            JOURNAL_ACTION_UNKNOWN: 400,
            JOURNAL_PERIOD_INVALID: 400,
        });
    });

    it('leaves a fault of the code out of the registry: it is logged and answered as INTERNAL_ERROR', () => {
        expect(
            FAULTS.filter((code) => Object.hasOwn(ERROR_STATUSES, code)),
        ).toEqual([]);
    });
});
