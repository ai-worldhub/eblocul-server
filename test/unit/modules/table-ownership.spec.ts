import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCHEMA_DIR = join(ROOT, 'prisma/schema');
const MODULE_ROOTS = ['src/core', 'src/modules'];
const SHARED_ROOT = 'src/shared';
const REFERENCE_VIEWS: string[] = ['NodeAncestor'];

const MODEL = /^model\s+(\w+)\s*\{/gm;
const DELEGATE_CALL =
    /\b(?:tx|_db|db)\.(\w+)\.(?:find\w+|create\w*|update\w*|upsert|delete\w*|count|aggregate|groupBy)\b/g;
const PRISMA_TYPE = /\bPrisma\.(\w+)\b/g;

type Usage = { file: string; model: string };

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

const usagesIn = (file: string, models: Map<string, string>): Usage[] => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const byDelegate = new Map(
        [...models.keys()].map((model) => [lowerFirst(model), model]),
    );
    const called = [...text.matchAll(DELEGATE_CALL)].flatMap((match) => {
        const model = byDelegate.get(match[1] ?? '');
        return model === undefined ? [] : [model];
    });
    const names = [...models.keys()].sort(
        (left, right) => right.length - left.length,
    );
    const typed = [...text.matchAll(PRISMA_TYPE)].flatMap((match) => {
        const model = names.find((name) => (match[1] ?? '').startsWith(name));
        return model === undefined ? [] : [model];
    });
    return [...new Set([...called, ...typed])].map((model) => ({
        file,
        model,
    }));
};

describe('table ownership', () => {
    const models = owners();

    it('lets a module touch only the models of its own schema file', () => {
        const foreign = MODULE_ROOTS.flatMap((root) =>
            sourceFiles(root).flatMap((file) => {
                const module = file.slice(root.length + 1).split('/')[0];
                return usagesIn(file, models).filter(
                    ({ model }) =>
                        models.get(model) !== module &&
                        !REFERENCE_VIEWS.includes(model),
                );
            }),
        ).map(
            ({ file, model }) =>
                `${file} uses ${model} of ${models.get(model) ?? 'nobody'}`,
        );

        expect(foreign).toEqual([]);
    });

    it('keeps shared/ away from every model', () => {
        const used = sourceFiles(SHARED_ROOT)
            .flatMap((file) => usagesIn(file, models))
            .map(({ file, model }) => `${file} uses ${model}`);

        expect(used).toEqual([]);
    });
});
