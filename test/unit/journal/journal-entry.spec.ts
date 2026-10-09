import {
    type JournalActor,
    journalEntryOf,
    type JournalRecord,
    SYSTEM_ACTOR,
} from '../../../src/core/journal/domain/entities/journal-entry.ts';
import { defineJournalAction } from '../../../src/core/journal/domain/rules/journal-action.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const ENTRY_ID = '00000000-0000-7000-8000-0000000000e1';
const NODE_ID = '00000000-0000-7000-8000-0000000000a1';
const ACCOUNT_ID = '00000000-0000-7000-8000-0000000000b1';
const SUBJECT_ID = '00000000-0000-7000-8000-0000000000b2';
const UNIT_ID = '00000000-0000-7000-8000-0000000000c1';
const TICKET_ID = '00000000-0000-7000-8000-0000000000d1';
const STAMP = { id: ENTRY_ID, now: NOW };

const TICKET_CLOSED = defineJournalAction({
    name: 'tickets.closed',
    details: {
        ticketId: 'id',
        attempts: 'integer',
        isUrgent: 'boolean',
        reason: ['solved', 'rejected'],
    },
});

const ADMINISTRATOR: JournalActor = {
    kind: 'account',
    accountId: ACCOUNT_ID,
    role: 'administrator',
};

const DETAILS = {
    ticketId: TICKET_ID,
    attempts: 2,
    isUrgent: false,
    reason: 'solved',
} as const;

const unchecked = (
    record: unknown,
): JournalRecord<typeof TICKET_CLOSED.details> =>
    record as JournalRecord<typeof TICKET_CLOSED.details>;

const refusalOf = (record: unknown): unknown => {
    try {
        journalEntryOf(TICKET_CLOSED, unchecked(record), STAMP);
    } catch (error) {
        return typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'details' in error
            ? { code: error.code, details: error.details }
            : error;
    }
    return null;
};

const refusedFor = (field: string): unknown => ({
    code: 'JOURNAL_ENTRY_INVALID',
    details: { action: 'tickets.closed', field },
});

describe('journalEntryOf', () => {
    it('makes an entry of an account that acted by a role', () => {
        const entry = journalEntryOf(
            TICKET_CLOSED,
            {
                actor: ADMINISTRATOR,
                nodeId: NODE_ID,
                subjectAccountId: SUBJECT_ID,
                subjectUnitId: UNIT_ID,
                details: DETAILS,
            },
            STAMP,
        );

        expect(entry).toEqual({
            id: ENTRY_ID,
            nodeId: NODE_ID,
            action: 'tickets.closed',
            actorKind: 'account',
            actorAccountId: ACCOUNT_ID,
            actorRole: 'administrator',
            subjectAccountId: SUBJECT_ID,
            subjectUnitId: UNIT_ID,
            details: DETAILS,
            createdAt: NOW,
        });
    });

    it('makes an entry of the system: no account, no role, no subject', () => {
        const entry = journalEntryOf(
            TICKET_CLOSED,
            { actor: SYSTEM_ACTOR, nodeId: NODE_ID, details: DETAILS },
            STAMP,
        );

        expect(entry).toMatchObject({
            actorKind: 'system',
            actorAccountId: null,
            actorRole: null,
            subjectAccountId: null,
            subjectUnitId: null,
        });
    });

    it('accepts an account that acted by no role', () => {
        const entry = journalEntryOf(
            TICKET_CLOSED,
            {
                actor: { kind: 'account', accountId: ACCOUNT_ID, role: null },
                nodeId: NODE_ID,
                details: DETAILS,
            },
            STAMP,
        );

        expect(entry).toMatchObject({
            actorKind: 'account',
            actorAccountId: ACCOUNT_ID,
            actorRole: null,
        });
    });

    it.each([
        ['a node that is not an id', { nodeId: 'Test House' }, 'nodeId'],
        [
            'an author that is not an id',
            { actor: { ...ADMINISTRATOR, accountId: 'admin@example.com' } },
            'actor',
        ],
        [
            'an unknown role of the author',
            { actor: { ...ADMINISTRATOR, role: 'guard' } },
            'actor',
        ],
        ['an unknown kind of author', { actor: { kind: 'team' } }, 'actor'],
        [
            'a person named instead of referred to',
            { subjectAccountId: 'Test Person' },
            'subjectAccountId',
        ],
        [
            'a unit named by its number',
            { subjectUnitId: '45' },
            'subjectUnitId',
        ],
    ])('refuses %s', (_case, change, field) => {
        expect(
            refusalOf({
                actor: ADMINISTRATOR,
                nodeId: NODE_ID,
                details: DETAILS,
                ...change,
            }),
        ).toEqual(refusedFor(field));
    });

    it.each([
        [
            'a name where an id is declared',
            { ticketId: 'Test Person' },
            'ticketId',
        ],
        [
            'a phone where an id is declared',
            { ticketId: '+37300000000' },
            'ticketId',
        ],
        [
            'free text where a value is declared',
            { reason: 'the tap leaks' },
            'reason',
        ],
        ['a value the action does not list', { reason: 'reopened' }, 'reason'],
        [
            'a fraction where an integer is declared',
            { attempts: 1.5 },
            'attempts',
        ],
        ['a number written as text', { attempts: '2' }, 'attempts'],
        ['a word where a boolean is declared', { isUrgent: 'yes' }, 'isUrgent'],
        ['a missing detail', { reason: undefined }, 'reason'],
        ['a null detail', { ticketId: null }, 'ticketId'],
        ['a detail the action does not declare', { comment: 'x' }, 'comment'],
        ['a nested object', { ticketId: { id: TICKET_ID } }, 'ticketId'],
    ])('refuses %s', (_case, change, field) => {
        expect(
            refusalOf({
                actor: ADMINISTRATOR,
                nodeId: NODE_ID,
                details: { ...DETAILS, ...change },
            }),
        ).toEqual(refusedFor(field));
    });

    it('carries nothing but the declared details into the entry', () => {
        const entry = journalEntryOf(
            defineJournalAction({ name: 'tickets.opened', details: {} }),
            { actor: SYSTEM_ACTOR, nodeId: NODE_ID, details: {} },
            STAMP,
        );

        expect(entry.details).toEqual({});
    });
});
