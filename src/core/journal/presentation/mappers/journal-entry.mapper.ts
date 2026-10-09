import type { CursorPage } from '../../../../shared/http/pagination.ts';
import type {
    JournalEntryView,
    Person,
} from '../../domain/entities/journal-entry-view.ts';
import type { JournalEntry } from '../dto/journal-entry.dto.ts';

const toPerson = (person: Person | null): JournalEntry.Person | null =>
    person === null
        ? null
        : {
              id: person.id,
              firstName: person.firstName,
              lastName: person.lastName,
          };

const toCard = (entry: JournalEntryView): JournalEntry.Card => ({
    id: entry.id,
    createdAt: entry.createdAt,
    action: entry.action,
    actor: {
        kind: entry.actor.kind,
        account: toPerson(entry.actor.account),
        role: entry.actor.role,
    },
    node: {
        id: entry.node.id,
        kind: entry.node.kind,
        name: entry.node.name,
    },
    subjectAccount: toPerson(entry.subjectAccount),
    subjectUnit:
        entry.subjectUnit === null
            ? null
            : {
                  id: entry.subjectUnit.id,
                  type: entry.subjectUnit.type,
                  number: entry.subjectUnit.number,
              },
    details: { ...entry.details },
});

export const toJournalListResponse = (
    page: CursorPage<JournalEntryView>,
): JournalEntry.ListResponse => ({
    items: page.items.map(toCard),
    nextCursor: page.nextCursor,
});
