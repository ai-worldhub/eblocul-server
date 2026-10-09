import {
    accountIdsOf,
    type ListedEntry,
    namedEntryOf,
} from '../../../src/core/journal/domain/entities/journal-entry-view.ts';
import {
    isSmallSubtree,
    knownActionOf,
    periodOf,
    SMALL_SUBTREE_NODES,
} from '../../../src/core/journal/domain/rules/feed.ts';

const ACTOR_ID = '00000000-0000-7000-8000-0000000000b1';
const SUBJECT_ID = '00000000-0000-7000-8000-0000000000b2';

const ENTRY: ListedEntry = {
    id: '00000000-0000-7000-8000-0000000000e1',
    createdAt: new Date('2026-10-09T09:00:00.000Z'),
    action: 'membership.role_assigned',
    actorKind: 'account',
    actorAccountId: ACTOR_ID,
    actorRole: 'chief_administrator',
    node: {
        id: '00000000-0000-7000-8000-0000000000a1',
        kind: 'zone',
        name: 'Test Zone',
    },
    subjectAccountId: SUBJECT_ID,
    subjectUnit: null,
    details: { role: 'administrator' },
};

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

describe('periodOf', () => {
    it('reads both ends as moments, whatever offset they are written with', () => {
        expect(
            periodOf('2026-10-01T00:00:00+03:00', '2026-11-01T00:00:00+02:00'),
        ).toEqual({
            from: new Date('2026-09-30T21:00:00.000Z'),
            to: new Date('2026-10-31T22:00:00.000Z'),
        });
    });

    it('leaves an end that is not given open', () => {
        expect(periodOf(undefined, undefined)).toEqual({
            from: null,
            to: null,
        });
        expect(periodOf('2026-10-01T00:00:00Z', undefined)).toEqual({
            from: new Date('2026-10-01T00:00:00.000Z'),
            to: null,
        });
    });

    it.each([
        [
            'an end before the start',
            '2026-10-02T00:00:00Z',
            '2026-10-01T00:00:00Z',
        ],
        [
            'an empty period',
            '2026-10-01T00:00:00Z',
            '2026-10-01T03:00:00+03:00',
        ],
        ['a start that is not a moment', 'yesterday', undefined],
        ['an end that is not a moment', undefined, '2026-13-45T00:00:00Z'],
    ])('refuses %s', (_case, from, to) => {
        expect(codeOf(() => periodOf(from, to))).toBe('JOURNAL_PERIOD_INVALID');
    });
});

describe('knownActionOf', () => {
    const names = ['membership.role_assigned', 'membership.zone_taken'];

    it('passes a registered action and the absence of a filter', () => {
        expect(knownActionOf(names, 'membership.zone_taken')).toBe(
            'membership.zone_taken',
        );
        expect(knownActionOf(names, undefined)).toBeNull();
    });

    it('refuses a name no module registered', () => {
        expect(codeOf(() => knownActionOf(names, 'tickets.closed'))).toBe(
            'JOURNAL_ACTION_UNKNOWN',
        );
    });
});

describe('isSmallSubtree', () => {
    it('reads node by node up to the limit and by the list index above it', () => {
        expect(isSmallSubtree(0)).toBe(true);
        expect(isSmallSubtree(SMALL_SUBTREE_NODES)).toBe(true);
        expect(isSmallSubtree(SMALL_SUBTREE_NODES + 1)).toBe(false);
    });
});

describe('namedEntryOf', () => {
    it('puts the names of the author and of the subject next to their ids', () => {
        const names = [
            { id: ACTOR_ID, firstName: 'Test', lastName: 'Chief' },
            { id: SUBJECT_ID, firstName: 'Test', lastName: 'Administrator' },
        ];

        expect(namedEntryOf(ENTRY, names)).toEqual({
            id: ENTRY.id,
            createdAt: ENTRY.createdAt,
            action: 'membership.role_assigned',
            actor: {
                kind: 'account',
                account: { id: ACTOR_ID, firstName: 'Test', lastName: 'Chief' },
                role: 'chief_administrator',
            },
            node: ENTRY.node,
            subjectAccount: {
                id: SUBJECT_ID,
                firstName: 'Test',
                lastName: 'Administrator',
            },
            subjectUnit: null,
            details: { role: 'administrator' },
        });
    });

    it('shows the system as an author without an account', () => {
        const entry: ListedEntry = {
            ...ENTRY,
            actorKind: 'system',
            actorAccountId: null,
            actorRole: null,
            subjectAccountId: null,
        };

        expect(namedEntryOf(entry, [])).toMatchObject({
            actor: { kind: 'system', account: null, role: null },
            subjectAccount: null,
        });
    });

    it('keeps the id when the account gives no name', () => {
        expect(namedEntryOf(ENTRY, []).actor.account).toEqual({
            id: ACTOR_ID,
            firstName: null,
            lastName: null,
        });
    });

    it('asks for the name of every account once', () => {
        const twin: ListedEntry = { ...ENTRY, subjectAccountId: ACTOR_ID };

        expect(accountIdsOf([ENTRY, twin])).toEqual([ACTOR_ID, SUBJECT_ID]);
    });
});
