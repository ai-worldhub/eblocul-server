import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_STATUSES } from '../../../src/app/error-statuses.ts';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const TABLE_FILE = '.error-statuses.ts';
const GENERATED = 'generated';
const FIRST_FAULT_STATUS = 500;

const tableFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
        .filter(
            (file) => file.endsWith(TABLE_FILE) && !file.startsWith(GENERATED),
        )
        .map((file) => join(SRC, file));

const isTable = (value: unknown): value is Record<string, number> =>
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((status) => typeof status === 'number');

describe('ERROR_STATUSES', () => {
    it('includes every status table of every module', async () => {
        for (const file of tableFiles()) {
            const exported = (await import(file)) as Record<string, unknown>;
            const tables = Object.values(exported).filter(isTable);

            expect(
                tables.length,
                `${file}: exports no status table`,
            ).toBeGreaterThan(0);
            for (const table of tables) {
                for (const [code, status] of Object.entries(table)) {
                    expect(
                        ERROR_STATUSES[code],
                        `${code} from ${file} is not in the registry`,
                    ).toBe(status);
                }
            }
        }
    });

    it('holds no fault of the code: a status from 500 is answered as INTERNAL_ERROR and logged', () => {
        const faults = Object.entries(ERROR_STATUSES)
            .filter(([, status]) => status >= FIRST_FAULT_STATUS)
            .map(([code]) => code);

        expect(faults).toEqual([]);
    });
});
