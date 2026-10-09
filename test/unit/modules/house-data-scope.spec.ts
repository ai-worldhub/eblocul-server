import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCHEMA_DIR = join(ROOT, 'prisma/schema');
const MODULE_ROOTS = ['src/core', 'src/modules'];

const MODEL = /^model\s+(\w+)\s*\{([^}]*)\}/gm;
const TABLE = /@@map\("([^"]+)"\)/;
const SCHEMA = /@@schema\("([^"]+)"\)/;
const HOUSE_DATA_FIELDS = [/^\s*complexId\s/m, /^\s*ownerNodeId\s/m];
const TEMPLATE = /`(?:[^`\\]|\\.)*`/g;
const READING_DELEGATE = /^(?:find\w+|count|aggregate|groupBy)$/;
const SQL_SCOPE = 'scopeCondition(';
const DELEGATE_SCOPE = 'scopeWhere(';

type HouseData = { model: string; table: string };

type Reading = { file: string; what: string };

const lowerFirst = (name: string): string =>
    name.charAt(0).toLowerCase() + name.slice(1);

const escaped = (text: string): string =>
    text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const houseDataOf = (schema: string): HouseData[] =>
    [...schema.matchAll(MODEL)].flatMap((match) => {
        const body = match[2] ?? '';
        const table = TABLE.exec(body)?.[1];
        const namespace = SCHEMA.exec(body)?.[1];
        return HOUSE_DATA_FIELDS.every((field) => field.test(body)) &&
            table !== undefined &&
            namespace !== undefined
            ? [{ model: match[1] ?? '', table: `${namespace}.${table}` }]
            : [];
    });

const houseData = (): HouseData[] =>
    readdirSync(SCHEMA_DIR).flatMap((file) =>
        houseDataOf(readFileSync(join(SCHEMA_DIR, file), 'utf8')),
    );

const sourceFiles = (directory: string): string[] =>
    existsSync(join(ROOT, directory))
        ? readdirSync(join(ROOT, directory), {
              recursive: true,
              encoding: 'utf8',
          })
              .filter((file) => file.endsWith('.ts'))
              .map((file) => join(directory, file))
        : [];

const unscopedReadings = (
    text: string,
    file: string,
    tables: readonly HouseData[],
): Reading[] => {
    const sql = tables.flatMap(({ table }) => {
        const reads = new RegExp(
            String.raw`\b(?:FROM|JOIN)\s+${escaped(table)}\b`,
            'i',
        );
        return (text.match(TEMPLATE) ?? [])
            .filter(
                (template) =>
                    reads.test(template) && !template.includes(SQL_SCOPE),
            )
            .map(() => ({ file, what: `SQL over ${table}` }));
    });
    const delegates = tables.flatMap(({ model }) => {
        const call = new RegExp(
            String.raw`\.${lowerFirst(model)}\s*\.\s*(\w+)\(`,
            'g',
        );
        return [...text.matchAll(call)]
            .filter((match) => READING_DELEGATE.test(match[1] ?? ''))
            .filter(() => !text.includes(DELEGATE_SCOPE))
            .map((match) => ({ file, what: `${model}.${match[1] ?? ''}` }));
    });
    return [...sql, ...delegates];
};

describe('queries to house data', () => {
    const tables = houseData();

    it('finds the tables that hold house data', () => {
        expect(tables).toContainEqual({
            model: 'JournalEntry',
            table: 'journal.entries',
        });
    });

    it('put the access scope into every reading of such a table', () => {
        const unscoped = MODULE_ROOTS.flatMap((root) =>
            sourceFiles(root).flatMap((file) =>
                unscopedReadings(
                    readFileSync(join(ROOT, file), 'utf8'),
                    file,
                    tables,
                ),
            ),
        ).map(({ file, what }) => `${file}: ${what} without the access scope`);

        expect(unscoped).toEqual([]);
    });

    it('notice a reading without the scope and pass a reading with it', () => {
        const sample: HouseData[] = [
            { model: 'Ticket', table: 'tickets.tickets' },
        ];
        const found = (code: string): string[] =>
            unscopedReadings(code, 'x.ts', sample).map(({ what }) => what);

        expect(
            found(
                'Prisma.sql`SELECT t.id FROM tickets.tickets t WHERE ${scopeCondition(scope, COLUMNS)}`',
            ),
        ).toEqual([]);
        expect(
            found('tx.ticket.findMany({ where: { ...scopeWhere(scope) } })'),
        ).toEqual([]);
        expect(
            found(
                'Prisma.sql`INSERT INTO tickets.tickets (id) VALUES (${id}::uuid)`',
            ),
        ).toEqual([]);
        expect(
            found(
                'Prisma.sql`SELECT t.id FROM tickets.tickets t WHERE t.id = ${id}::uuid`',
            ),
        ).toEqual(['SQL over tickets.tickets']);
        expect(
            found(
                'Prisma.sql`SELECT 1 FROM x JOIN tickets.tickets t ON t.id = x.id`',
            ),
        ).toEqual(['SQL over tickets.tickets']);
        expect(found('tx.ticket.findMany({ where: { id } })')).toEqual([
            'Ticket.findMany',
        ]);
        expect(found('this._db.ticket.count()')).toEqual(['Ticket.count']);
    });
});
