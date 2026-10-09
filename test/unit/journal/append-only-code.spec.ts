import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const GENERATED = 'generated';
const CHANGING_DELEGATE =
    /\.journalEntry\s*\.\s*(update\w*|upsert|delete\w*)\b/g;
const CHANGING_SQL =
    /\b(UPDATE\s+(ONLY\s+)?journal\.|DELETE\s+FROM\s+(ONLY\s+)?journal\.|TRUNCATE\b|ON\s+CONFLICT[^;`]*journal\.|ALTER\s+TABLE\s+journal\.|DISABLE\s+TRIGGER)/gi;

const changesIn = (text: string): string[] =>
    [...text.matchAll(CHANGING_DELEGATE), ...text.matchAll(CHANGING_SQL)].map(
        (match) => match[0],
    );

const sourceFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
        (file) => file.endsWith('.ts') && !file.startsWith(GENERATED),
    );

describe('the action journal in the code', () => {
    it('is never changed, removed or switched off anywhere in src/', () => {
        const changes = sourceFiles().flatMap((file) =>
            changesIn(readFileSync(join(SRC, file), 'utf8')).map(
                (change) => `${file}: ${change}`,
            ),
        );

        expect(changes).toEqual([]);
    });

    it('notices every way to change an entry', () => {
        expect(
            changesIn(`
                tx.journalEntry.update({ where, data });
                this._db.journalEntry.updateMany({ data });
                tx.journalEntry.upsert({ where, create, update });
                tx.journalEntry.delete({ where });
                tx.journalEntry.deleteMany();
                UPDATE journal.entries SET action = 'x';
                DELETE FROM journal.entries;
                TRUNCATE journal.entries;
                ALTER TABLE journal.entries DISABLE TRIGGER entries_append_only;
            `),
        ).toHaveLength(10);
        expect(
            changesIn(`
                tx.journalEntry.findMany({ where });
                INSERT INTO journal.entries (id) SELECT 1;
                SELECT e.id FROM journal.entries e;
                UPDATE membership.node_assignments SET ended_at = now();
            `),
        ).toEqual([]);
    });
});
