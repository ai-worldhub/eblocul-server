import { JournalError } from '../journal.errors.ts';
import { isUuid } from '../rules/identifiers.ts';
import {
    type Details,
    type DetailShape,
    type DetailsOf,
    detailsOf,
    type JournalAction,
} from '../rules/journal-action.ts';

export const ACTOR_KINDS = ['account', 'system'] as const;

export type ActorKind = (typeof ACTOR_KINDS)[number];

export const ACTOR_ROLES = [
    'chief_administrator',
    'administrator',
    'chairman',
    'owner',
    'family_member',
    'tenant',
] as const;

export type ActorRole = (typeof ACTOR_ROLES)[number];

export type JournalActor =
    | {
          readonly kind: 'account';
          readonly accountId: string;
          readonly role: ActorRole | null;
      }
    | { readonly kind: 'system' };

export const SYSTEM_ACTOR: JournalActor = { kind: 'system' };

export type JournalRecord<Shape extends DetailShape = DetailShape> = {
    actor: JournalActor;
    nodeId: string;
    subjectAccountId?: string;
    subjectUnitId?: string;
    details: DetailsOf<Shape>;
};

export type JournalEntry = {
    id: string;
    nodeId: string;
    action: string;
    actorKind: ActorKind;
    actorAccountId: string | null;
    actorRole: ActorRole | null;
    subjectAccountId: string | null;
    subjectUnitId: string | null;
    details: Details;
    createdAt: Date;
};

type Stamp = { id: string; now: Date };

type Author = Pick<JournalEntry, 'actorKind' | 'actorAccountId' | 'actorRole'>;

const refused = (
    action: JournalAction,
    field: string,
    reason: string,
): JournalError =>
    new JournalError('JOURNAL_ENTRY_INVALID', reason, {
        action: action.name,
        field,
    });

const isRole = (role: unknown): role is ActorRole =>
    ACTOR_ROLES.some((known) => known === role);

const authorOf = (action: JournalAction, actor: JournalActor): Author => {
    if (actor.kind === 'system') {
        return { actorKind: 'system', actorAccountId: null, actorRole: null };
    }
    if (actor.kind !== 'account' || !isUuid(actor.accountId)) {
        throw refused(
            action,
            'actor',
            'The author is an account with an id or the system',
        );
    }
    if (actor.role !== null && !isRole(actor.role)) {
        throw refused(
            action,
            'actor',
            'The author acts by a known role or by none',
        );
    }
    return {
        actorKind: 'account',
        actorAccountId: actor.accountId,
        actorRole: actor.role,
    };
};

const referenceOf = (
    action: JournalAction,
    field: string,
    id: string | undefined,
): string | null => {
    if (id === undefined) {
        return null;
    }
    if (!isUuid(id)) {
        throw refused(action, field, 'A journal entry refers to ids only');
    }
    return id;
};

export const journalEntryOf = <Shape extends DetailShape>(
    action: JournalAction<Shape>,
    record: JournalRecord<Shape>,
    stamp: Stamp,
): JournalEntry => {
    if (!isUuid(record.nodeId)) {
        throw refused(action, 'nodeId', 'A journal entry belongs to a node');
    }
    return {
        id: stamp.id,
        nodeId: record.nodeId,
        action: action.name,
        ...authorOf(action, record.actor),
        subjectAccountId: referenceOf(
            action,
            'subjectAccountId',
            record.subjectAccountId,
        ),
        subjectUnitId: referenceOf(
            action,
            'subjectUnitId',
            record.subjectUnitId,
        ),
        details: detailsOf(action, record.details),
        createdAt: stamp.now,
    };
};
