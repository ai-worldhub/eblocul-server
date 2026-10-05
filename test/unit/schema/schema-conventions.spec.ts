import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_DIR = fileURLToPath(
    new URL('../../../prisma/schema', import.meta.url),
);

const BLOCK = /^(model|enum)\s+(\w+)\s*\{([^}]*)\}/gm;
const SNAKE = /^[a-z][a-z0-9_]*$/;
const MAPPED = /@map\("([^"]+)"\)/;
const BLOCK_MAPPED = /@@map\("([^"]+)"\)/;
const RELATION_FIELDS = /@relation\([^)]*fields:\s*\[([^\]]+)\]/;
const LEADING_COLUMN = /@@(?:index|unique|id)\(\[\s*(\w+)/g;
const SCALARS = [
    'String',
    'Int',
    'BigInt',
    'Boolean',
    'DateTime',
    'Decimal',
    'Float',
    'Json',
    'Bytes',
];

type Block = { kind: string; name: string; lines: string[]; file: string };
type Field = { name: string; type: string; text: string };

const toSnake = (name: string): string =>
    name.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const blocks = (): Block[] =>
    readdirSync(SCHEMA_DIR).flatMap((file) =>
        [...readFileSync(join(SCHEMA_DIR, file), 'utf8').matchAll(BLOCK)].map(
            (match) => ({
                kind: match[1] ?? '',
                name: match[2] ?? '',
                file,
                lines: (match[3] ?? '')
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line !== '' && !line.startsWith('//')),
            }),
        ),
    );

const fieldsOf = (block: Block): Field[] =>
    block.lines
        .filter((line) => !line.startsWith('@@'))
        .map((line) => {
            const [name = '', type = ''] = line.split(/\s+/);
            return { name, type: type.replaceAll(/[?[\]]/g, ''), text: line };
        });

const fieldProblems = (field: Field, enums: string[]): string[] => {
    const isScalar = SCALARS.includes(field.type);
    const isColumn = isScalar || enums.includes(field.type);
    const problems: string[] = [];
    if (isColumn && toSnake(field.name) !== field.name) {
        if (MAPPED.exec(field.text)?.[1] !== toSnake(field.name)) {
            problems.push(`needs @map("${toSnake(field.name)}")`);
        }
    }
    if (field.type === 'Float') {
        problems.push('uses Float');
    }
    if (field.type === 'DateTime') {
        if (!field.text.includes('@db.Timestamptz(')) {
            problems.push('needs @db.Timestamptz');
        }
        if (
            field.text.includes('@default(now())') ||
            field.text.includes('@updatedAt')
        ) {
            problems.push('takes the time from the database, not from Clock');
        }
    }
    if (field.text.includes('@id')) {
        if (!field.text.includes('@db.Uuid')) {
            problems.push('id needs @db.Uuid');
        }
        if (field.text.includes('@default(')) {
            problems.push('id has a default: it comes from Ids');
        }
    }
    if (field.text.includes('@relation(') && RELATION_FIELDS.test(field.text)) {
        if (!field.text.includes('onDelete:')) {
            problems.push('relation needs an explicit onDelete');
        }
    }
    return problems.map((problem) => `${field.name}: ${problem}`);
};

const unindexedKeys = (block: Block): string[] => {
    const fields = fieldsOf(block);
    const leading = new Set([
        ...[...block.lines.join('\n').matchAll(LEADING_COLUMN)].map(
            (match) => match[1] ?? '',
        ),
        ...fields
            .filter(
                (field) =>
                    field.text.includes('@id') ||
                    field.text.includes('@unique'),
            )
            .map((field) => field.name),
    ]);
    return fields.flatMap((field) => {
        const key = RELATION_FIELDS.exec(field.text)?.[1]
            ?.split(',')[0]
            ?.trim();
        return key === undefined || leading.has(key)
            ? []
            : [`${key}: foreign key column leads no index`];
    });
};

const modelProblems = (block: Block, enums: string[]): string[] => {
    const mapped = BLOCK_MAPPED.exec(block.lines.join('\n'))?.[1];
    return [
        ...(mapped === undefined || !SNAKE.test(mapped)
            ? ['needs @@map with a snake_case name']
            : []),
        ...fieldsOf(block).flatMap((field) => fieldProblems(field, enums)),
        ...unindexedKeys(block),
    ];
};

const enumProblems = (block: Block): string[] => {
    const mapped = BLOCK_MAPPED.exec(block.lines.join('\n'))?.[1];
    return [
        ...(mapped === undefined || !SNAKE.test(mapped)
            ? ['needs @@map with a snake_case name']
            : []),
        ...block.lines
            .filter((line) => !line.startsWith('@@') && !SNAKE.test(line))
            .map((value) => `${value}: value is not lower snake_case`),
    ];
};

describe('prisma schema', () => {
    it('follows the conventions of .claude/rules/schema.md', () => {
        const all = blocks();
        const enums = all
            .filter((block) => block.kind === 'enum')
            .map((block) => block.name);

        const problems = all.flatMap((block) =>
            (block.kind === 'enum'
                ? enumProblems(block)
                : modelProblems(block, enums)
            ).map((problem) => `${block.file} ${block.name}: ${problem}`),
        );

        expect(problems).toEqual([]);
    });
});
