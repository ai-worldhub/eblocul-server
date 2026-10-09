import {
    assertDistinctActions,
    defineJournalAction,
    type JournalAction,
} from '../../../src/core/journal/domain/rules/journal-action.ts';

const unchecked = (action: unknown): JournalAction => action as JournalAction;

const codeOf = (work: () => unknown): unknown => {
    try {
        work();
    } catch (error) {
        return typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : error;
    }
    return null;
};

const refusalOf = (action: unknown): unknown =>
    codeOf(() => defineJournalAction(unchecked(action)));

describe('defineJournalAction', () => {
    it('keeps the name and the declared details', () => {
        const action = defineJournalAction({
            name: 'tickets.closed',
            details: {
                ticketId: 'id',
                attempts: 'integer',
                isUrgent: 'boolean',
                reason: ['solved', 'rejected'],
            },
        });

        expect(action).toEqual({
            name: 'tickets.closed',
            details: {
                ticketId: 'id',
                attempts: 'integer',
                isUrgent: 'boolean',
                reason: ['solved', 'rejected'],
            },
        });
    });

    it('accepts an action without details', () => {
        expect(refusalOf({ name: 'tickets.opened', details: {} })).toBeNull();
    });

    it.each([
        'closed',
        'Tickets.closed',
        'tickets.Closed',
        'tickets.closed.twice',
        'tickets closed',
        '',
    ])('refuses the name %j', (name) => {
        expect(refusalOf({ name, details: {} })).toBe('JOURNAL_ACTION_INVALID');
    });

    it.each([
        ['a field that is not camelCase', { ticket_id: 'id' }],
        ['free text as a kind', { comment: 'text' }],
        ['a string as a kind', { title: 'string' }],
        ['an empty list of values', { reason: [] }],
        ['a value that is not lower snake_case', { reason: ['Solved'] }],
        ['a value with a space', { reason: ['not solved'] }],
        ['a nested object', { place: { nodeId: 'id' } }],
    ])('refuses %s', (_case, details) => {
        expect(refusalOf({ name: 'tickets.closed', details })).toBe(
            'JOURNAL_ACTION_INVALID',
        );
    });

    it('refuses more details than an entry may carry', () => {
        const details = Object.fromEntries(
            Array.from({ length: 13 }, (_, index) => [`field${index}`, 'id']),
        );

        expect(refusalOf({ name: 'tickets.closed', details })).toBe(
            'JOURNAL_ACTION_INVALID',
        );
    });
});

describe('assertDistinctActions', () => {
    const closed = defineJournalAction({ name: 'tickets.closed', details: {} });
    const opened = defineJournalAction({ name: 'tickets.opened', details: {} });

    it('accepts actions under different names', () => {
        expect(
            codeOf(() => assertDistinctActions([closed, opened])),
        ).toBeNull();
    });

    it('refuses two actions under one name', () => {
        const twin = defineJournalAction({
            name: 'tickets.closed',
            details: { ticketId: 'id' },
        });

        expect(
            codeOf(() => assertDistinctActions([closed, opened, twin])),
        ).toBe('JOURNAL_ACTION_REPEATED');
    });
});
