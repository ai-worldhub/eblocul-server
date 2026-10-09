import { JournalError } from '../journal.errors.ts';
import { isUuid } from './identifiers.ts';

type DetailKind = 'id' | 'integer' | 'boolean' | readonly string[];

export type DetailShape = { readonly [field: string]: DetailKind };

type DetailValue = string | number | boolean;

export type Details = Record<string, DetailValue>;

type ValueOf<Kind> = Kind extends 'id'
    ? string
    : Kind extends 'integer'
      ? number
      : Kind extends 'boolean'
        ? boolean
        : Kind extends readonly (infer Value)[]
          ? Value
          : never;

export type DetailsOf<Shape extends DetailShape> = {
    -readonly [Field in keyof Shape]: ValueOf<Shape[Field]>;
};

export type JournalAction<Shape extends DetailShape = DetailShape> = {
    readonly name: string;
    readonly details: Shape;
};

const NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const FIELD_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const VALUE_PATTERN = /^[a-z][a-z0-9_]*$/;
const SCALAR_KINDS: readonly unknown[] = ['id', 'integer', 'boolean'];
const MAX_DETAIL_FIELDS = 12;
const MAX_INTEGER = 999_999;

const invalid = (name: string, reason: string): JournalError =>
    new JournalError('JOURNAL_ACTION_INVALID', reason, { action: name });

const isValueList = (kind: unknown): kind is readonly string[] =>
    Array.isArray(kind) &&
    kind.length > 0 &&
    kind.every(
        (value) => typeof value === 'string' && VALUE_PATTERN.test(value),
    );

export const defineJournalAction = <const Shape extends DetailShape>(
    input: JournalAction<Shape>,
): JournalAction<Shape> => {
    if (!NAME_PATTERN.test(input.name)) {
        throw invalid(
            input.name,
            'Journal action name is <module>.<what_happened> in lower snake_case',
        );
    }
    const fields = Object.entries<unknown>(input.details);
    if (fields.length > MAX_DETAIL_FIELDS) {
        throw invalid(input.name, 'Journal action declares too many details');
    }
    for (const [field, kind] of fields) {
        if (!FIELD_PATTERN.test(field)) {
            throw invalid(input.name, 'A detail is named in camelCase');
        }
        if (!SCALAR_KINDS.includes(kind) && !isValueList(kind)) {
            throw invalid(
                input.name,
                'A detail is an id, an integer, a boolean or a list of lower snake_case values',
            );
        }
    }
    return { name: input.name, details: input.details };
};

const refused = (
    action: JournalAction,
    field: string,
    reason: string,
): JournalError =>
    new JournalError('JOURNAL_ENTRY_INVALID', reason, {
        action: action.name,
        field,
    });

const isOfKind = (kind: DetailKind, value: unknown): value is DetailValue => {
    if (kind === 'id') {
        return isUuid(value);
    }
    if (kind === 'integer') {
        return (
            typeof value === 'number' &&
            Number.isSafeInteger(value) &&
            Math.abs(value) <= MAX_INTEGER
        );
    }
    if (kind === 'boolean') {
        return typeof value === 'boolean';
    }
    return typeof value === 'string' && kind.includes(value);
};

export const detailsOf = (
    action: JournalAction,
    given: Readonly<Record<string, unknown>>,
): Details => {
    const declared = Object.entries(action.details);
    const undeclared = Object.keys(given).find(
        (field) => !Object.hasOwn(action.details, field),
    );
    if (undeclared !== undefined) {
        throw refused(
            action,
            undeclared,
            'The journal action declares no such detail',
        );
    }
    return Object.fromEntries(
        declared.map(([field, kind]) => {
            const value = given[field];
            if (!isOfKind(kind, value)) {
                throw refused(
                    action,
                    field,
                    'A detail holds an id, an integer of six digits at most, a boolean or a declared value',
                );
            }
            return [field, value];
        }),
    );
};

export const assertRegistered = (
    registered: readonly JournalAction[],
    action: JournalAction,
): void => {
    if (!registered.includes(action)) {
        throw new JournalError(
            'JOURNAL_ACTION_NOT_REGISTERED',
            'The journal action is not in the list of journal actions',
            { action: action.name },
        );
    }
};

export const assertDistinctActions = (
    actions: readonly JournalAction[],
): void => {
    const names = actions.map((action) => action.name);
    const repeated = names.find((name, index) => names.indexOf(name) !== index);
    if (repeated !== undefined) {
        throw new JournalError(
            'JOURNAL_ACTION_REPEATED',
            'Two journal actions carry the same name',
            { action: repeated },
        );
    }
};
