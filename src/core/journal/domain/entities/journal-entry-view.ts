import type { Details } from '../rules/journal-action.ts';
import type { ActorKind, ActorRole } from './journal-entry.ts';

export const NODE_KINDS = [
    'quarter',
    'zone',
    'building',
    'line',
    'entrance',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const UNIT_TYPES = [
    'apartment',
    'townhouse',
    'house',
    'duplex',
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

type NodeReference = { id: string; kind: NodeKind; name: string };

type UnitReference = { id: string; type: UnitType; number: string };

export type ListedEntry = {
    id: string;
    createdAt: Date;
    action: string;
    actorKind: ActorKind;
    actorAccountId: string | null;
    actorRole: ActorRole | null;
    node: NodeReference;
    subjectAccountId: string | null;
    subjectUnit: UnitReference | null;
    details: Details;
};

export type PersonName = {
    id: string;
    firstName: string;
    lastName: string;
};

export type Person = {
    id: string;
    firstName: string | null;
    lastName: string | null;
};

export type JournalEntryView = {
    id: string;
    createdAt: Date;
    action: string;
    actor: { kind: ActorKind; account: Person | null; role: ActorRole | null };
    node: NodeReference;
    subjectAccount: Person | null;
    subjectUnit: UnitReference | null;
    details: Details;
};

const personOf = (
    accountId: string | null,
    names: readonly PersonName[],
): Person | null => {
    if (accountId === null) {
        return null;
    }
    const name = names.find((known) => known.id === accountId);
    return {
        id: accountId,
        firstName: name?.firstName ?? null,
        lastName: name?.lastName ?? null,
    };
};

export const accountIdsOf = (entries: readonly ListedEntry[]): string[] => [
    ...new Set(
        entries.flatMap((entry) =>
            [entry.actorAccountId, entry.subjectAccountId].filter(
                (id) => id !== null,
            ),
        ),
    ),
];

export const namedEntryOf = (
    entry: ListedEntry,
    names: readonly PersonName[],
): JournalEntryView => ({
    id: entry.id,
    createdAt: entry.createdAt,
    action: entry.action,
    actor: {
        kind: entry.actorKind,
        account: personOf(entry.actorAccountId, names),
        role: entry.actorRole,
    },
    node: entry.node,
    subjectAccount: personOf(entry.subjectAccountId, names),
    subjectUnit: entry.subjectUnit,
    details: entry.details,
});
