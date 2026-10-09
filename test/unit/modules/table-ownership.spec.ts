import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCHEMA_DIR = join(ROOT, 'prisma/schema');
const MODULE_ROOTS = ['src/core', 'src/modules'];
const SHARED_ROOT = 'src/shared';
const REFERENCE_VIEWS: string[] = [
    'Node',
    'NodeAncestor',
    'Unit',
    'NodeAssignment',
    'UnitMembership',
];

const MODEL = /^model\s+(\w+)\s*\{/gm;
const DELEGATE_CALL =
    /\b(?:tx|_db|db)\.(\w+)\.(find\w+|create\w*|update\w*|upsert|delete\w*|count|aggregate|groupBy)\b/g;
const PRISMA_TYPE = /\bPrisma\.(\w+)\b/g;
const WRITING_CALL = /^(?:create|update|upsert|delete)/;
const WRITING_TYPE = /(?:Create|Update|Upsert|Delete)/;

type Usage = { file: string; model: string; isWrite: boolean };

const lowerFirst = (name: string): string =>
    name.charAt(0).toLowerCase() + name.slice(1);

const owners = (): Map<string, string> => {
    const result = new Map<string, string>();
    for (const file of readdirSync(SCHEMA_DIR)) {
        const text = readFileSync(join(SCHEMA_DIR, file), 'utf8');
        for (const match of text.matchAll(MODEL)) {
            result.set(match[1] ?? '', basename(file, '.prisma'));
        }
    }
    return result;
};

const sourceFiles = (directory: string): string[] =>
    existsSync(join(ROOT, directory))
        ? readdirSync(join(ROOT, directory), {
              recursive: true,
              encoding: 'utf8',
          })
              .filter((file) => file.endsWith('.ts'))
              .map((file) => join(directory, file))
        : [];

const usagesInText = (
    text: string,
    file: string,
    models: Map<string, string>,
): Usage[] => {
    const byDelegate = new Map(
        [...models.keys()].map((model) => [lowerFirst(model), model]),
    );
    const called = [...text.matchAll(DELEGATE_CALL)].flatMap((match) => {
        const model = byDelegate.get(match[1] ?? '');
        return model === undefined
            ? []
            : [{ model, isWrite: WRITING_CALL.test(match[2] ?? '') }];
    });
    const names = [...models.keys()].sort(
        (left, right) => right.length - left.length,
    );
    const typed = [...text.matchAll(PRISMA_TYPE)].flatMap((match) => {
        const type = match[1] ?? '';
        const model = names.find((name) => type.startsWith(name));
        return model === undefined
            ? []
            : [
                  {
                      model,
                      isWrite: WRITING_TYPE.test(type.slice(model.length)),
                  },
              ];
    });
    const used = new Map<string, boolean>();
    for (const { model, isWrite } of [...called, ...typed]) {
        used.set(model, (used.get(model) ?? false) || isWrite);
    }
    return [...used].map(([model, isWrite]) => ({ file, model, isWrite }));
};

const usagesIn = (file: string, models: Map<string, string>): Usage[] =>
    usagesInText(readFileSync(join(ROOT, file), 'utf8'), file, models);

const isForeign = (
    usage: Usage,
    module: string | undefined,
    models: Map<string, string>,
): boolean =>
    models.get(usage.model) !== module &&
    (usage.isWrite || !REFERENCE_VIEWS.includes(usage.model));

describe('table ownership', () => {
    const models = owners();

    it('lets a module touch only the models of its own schema file', () => {
        const foreign = MODULE_ROOTS.flatMap((root) =>
            sourceFiles(root).flatMap((file) => {
                const module = file.slice(root.length + 1).split('/')[0];
                return usagesIn(file, models).filter((usage) =>
                    isForeign(usage, module, models),
                );
            }),
        ).map(
            ({ file, model }) =>
                `${file} uses ${model} of ${models.get(model) ?? 'nobody'}`,
        );

        expect(foreign).toEqual([]);
    });

    it('lets another module read a reference view and never write to it', () => {
        const usagesOf = (code: string): string[] =>
            usagesInText(code, 'src/modules/tickets/x.ts', models)
                .filter((usage) => isForeign(usage, 'tickets', models))
                .map(({ model }) => model)
                .sort();

        expect(
            usagesOf(`
                tx.node.findMany({ where });
                tx.nodeAssignment.count();
                const where: Prisma.NodeWhereInput = {};
                type Row = Prisma.UnitGetPayload<{ select: typeof SELECT }>;
            `),
        ).toEqual([]);
        expect(
            usagesOf(`
                tx.nodeAssignment.create({ data });
                tx.unitMembership.updateMany({ where, data });
                tx.node.deleteMany();
                const row: Prisma.UnitCreateManyInput = input;
                tx.account.findMany();
            `),
        ).toEqual([
            'Account',
            'Node',
            'NodeAssignment',
            'Unit',
            'UnitMembership',
        ]);
    });

    it('keeps shared/ away from every model', () => {
        const used = sourceFiles(SHARED_ROOT)
            .flatMap((file) => usagesIn(file, models))
            .map(({ file, model }) => `${file} uses ${model}`);

        expect(used).toEqual([]);
    });
});
