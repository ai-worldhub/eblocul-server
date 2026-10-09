import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCESS_ACTIONS } from '../../../src/app/access-actions.ts';
import type { AccessAction } from '../../../src/core/authz/index.ts';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const ACTIONS_FILE = '.actions.ts';
const GENERATED = 'generated';

const actionFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
        .filter(
            (file) =>
                file.endsWith(ACTIONS_FILE) && !file.startsWith(GENERATED),
        )
        .map((file) => join(SRC, file));

const isAction = (value: unknown): value is AccessAction =>
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'kind' in value &&
    'grants' in value;

const declaredActions = async (): Promise<
    { file: string; action: AccessAction }[]
> => {
    const declared: { file: string; action: AccessAction }[] = [];
    for (const file of actionFiles()) {
        const exported = (await import(file)) as Record<string, unknown>;
        const actions = Object.values(exported).filter(isAction);

        expect(actions.length, `${file}: exports no action`).toBeGreaterThan(0);
        declared.push(...actions.map((action) => ({ file, action })));
    }
    return declared;
};

describe('ACCESS_ACTIONS', () => {
    it('includes every action of every module', async () => {
        for (const { file, action } of await declaredActions()) {
            expect(
                ACCESS_ACTIONS.includes(action),
                `${action.name} from ${file} is not in the registry`,
            ).toBe(true);
        }
    });

    it('lists only actions declared in *.actions.ts files', async () => {
        const declared = (await declaredActions()).map(({ action }) => action);

        expect(
            ACCESS_ACTIONS.filter((action) => !declared.includes(action)).map(
                (action) => action.name,
            ),
        ).toEqual([]);
    });

    it('lists every action once, under its own name', () => {
        const names = ACCESS_ACTIONS.map((action) => action.name);

        expect(new Set(ACCESS_ACTIONS).size).toBe(ACCESS_ACTIONS.length);
        expect(new Set(names).size).toBe(names.length);
    });

    it('grants every role exactly what the table of roles and actions says', () => {
        const table = Object.fromEntries(
            ACCESS_ACTIONS.map((action) => [
                action.name,
                { kind: action.kind, ...action.grants },
            ]),
        );

        expect(table).toEqual({
            'journal.read_entries': {
                kind: 'read',
                administrator: ['perimeter'],
                chairman: ['perimeter'],
                chief_administrator: ['quarter'],
            },
        });
    });
});
