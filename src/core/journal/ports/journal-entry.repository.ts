import type { Tx } from '../../../shared/db/tx.ts';
import type { JournalEntry } from '../domain/entities/journal-entry.ts';

export abstract class JournalEntryRepository {
    abstract append(tx: Tx, entry: JournalEntry): Promise<boolean>;
}
