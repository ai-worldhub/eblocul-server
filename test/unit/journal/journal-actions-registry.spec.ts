import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOURNAL_ACTIONS } from '../../../src/app/journal-actions.ts';
import {
    JournalFeedModule,
    type JournalAction,
} from '../../../src/core/journal/index.ts';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const ACTIONS_FILE = '.journal-actions.ts';
const GENERATED = 'generated';
const APP = 'app';

const actionFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
        .filter(
            (file) =>
                file.endsWith(ACTIONS_FILE) &&
                !file.startsWith(GENERATED) &&
                !file.startsWith(APP),
        )
        .map((file) => join(SRC, file));

const isAction = (value: unknown): value is JournalAction =>
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'details' in value;

const declaredActions = async (): Promise<
    { file: string; action: JournalAction }[]
> => {
    const declared: { file: string; action: JournalAction }[] = [];
    for (const file of actionFiles()) {
        const exported = (await import(file)) as Record<string, unknown>;
        const actions = Object.values(exported).filter(isAction);

        expect(actions.length, `${file}: exports no action`).toBeGreaterThan(0);
        declared.push(...actions.map((action) => ({ file, action })));
    }
    return declared;
};

const moduleOf = (file: string): string =>
    file.slice(SRC.length + 1).split('/')[1] ?? '';

describe('JOURNAL_ACTIONS', () => {
    it('includes every journal action of every module', async () => {
        const declared = await declaredActions();

        expect(declared.length).toBeGreaterThan(0);
        for (const { file, action } of declared) {
            expect(
                JOURNAL_ACTIONS.includes(action),
                `${action.name} from ${file} is not in the registry`,
            ).toBe(true);
        }
    });

    it('lists only actions declared in *.journal-actions.ts files', async () => {
        const declared = (await declaredActions()).map(({ action }) => action);

        expect(
            JOURNAL_ACTIONS.filter((action) => !declared.includes(action)).map(
                (action) => action.name,
            ),
        ).toEqual([]);
    });

    it('names every action after the module that declares it', async () => {
        for (const { file, action } of await declaredActions()) {
            expect(action.name.split('.')[0], action.name).toBe(moduleOf(file));
        }
    });

    it('lists every action once, under its own name', () => {
        const names = JOURNAL_ACTIONS.map((action) => action.name);

        expect(new Set(JOURNAL_ACTIONS).size).toBe(JOURNAL_ACTIONS.length);
        expect(names).toEqual([
            'membership.role_assigned',
            'membership.role_ended',
            'membership.zone_taken',
            'membership.zone_returned',
        ]);
    });

    it('does not let the feed start with two actions under one name', () => {
        const [first] = JOURNAL_ACTIONS;
        if (first === undefined) {
            throw new Error('The registry is empty');
        }

        expect(() =>
            JournalFeedModule.register([...JOURNAL_ACTIONS, { ...first }]),
        ).toThrow('Two journal actions carry the same name');
    });
});
