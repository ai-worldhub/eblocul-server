import { getMetadataStorage } from 'class-validator';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EnvironmentVariables } from '../../../src/shared/configs/env.validation.ts';

const EXAMPLE_FILE = fileURLToPath(
    new URL('../../../.env.example', import.meta.url),
);
const TOOL_VARIABLES = ['FORCE_COLOR'];

const exampleKeys = (): string[] =>
    readFileSync(EXAMPLE_FILE, 'utf8')
        .split('\n')
        .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
        .filter((key) => key !== undefined);

const validatedKeys = (): string[] => [
    ...new Set(
        getMetadataStorage()
            .getTargetValidationMetadatas(
                EnvironmentVariables,
                '',
                false,
                false,
            )
            .map((metadata) => metadata.propertyName),
    ),
];

describe('.env.example', () => {
    it('lists every variable the application validates', () => {
        expect(validatedKeys().length).toBeGreaterThan(0);
        const listed = exampleKeys();
        expect(validatedKeys().filter((key) => !listed.includes(key))).toEqual(
            [],
        );
    });

    it('lists nothing the application does not read', () => {
        const known = [...validatedKeys(), ...TOOL_VARIABLES];
        expect(exampleKeys().filter((key) => !known.includes(key))).toEqual([]);
    });

    it('lists every variable once', () => {
        expect(new Set(exampleKeys()).size).toBe(exampleKeys().length);
    });
});
