import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOB_HANDLERS } from '../../../src/app/job-handlers.ts';
import {
    JobHandler,
    type JobHandlerType,
} from '../../../src/core/jobs/index.ts';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const HANDLER_FILE = '.handler.ts';
const GENERATED = 'generated';

const handlerFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
        .filter(
            (file) =>
                file.endsWith(HANDLER_FILE) && !file.startsWith(GENERATED),
        )
        .map((file) => join(SRC, file));

const isHandlerType = (value: unknown): value is JobHandlerType =>
    typeof value === 'function' &&
    Object.prototype.isPrototypeOf.call(JobHandler, value);

const declaredHandlers = async (): Promise<
    { file: string; type: JobHandlerType }[]
> => {
    const declared: { file: string; type: JobHandlerType }[] = [];
    for (const file of handlerFiles()) {
        const exported = (await import(file)) as Record<string, unknown>;
        const types = Object.values(exported).filter(isHandlerType);

        expect(types.length, `${file}: exports no job handler`).toBeGreaterThan(
            0,
        );
        declared.push(...types.map((type) => ({ file, type })));
    }
    return declared;
};

describe('JOB_HANDLERS', () => {
    it('includes every handler of every module', async () => {
        for (const { file, type } of await declaredHandlers()) {
            expect(
                JOB_HANDLERS.includes(type),
                `${type.name} from ${file} is not in the registry`,
            ).toBe(true);
        }
    });

    it('lists only handlers declared in *.handler.ts files', async () => {
        const declared = (await declaredHandlers()).map(({ type }) => type);

        expect(
            JOB_HANDLERS.filter((type) => !declared.includes(type)).map(
                (type) => type.name,
            ),
        ).toEqual([]);
    });

    it('lists every handler once', () => {
        expect(new Set(JOB_HANDLERS).size).toBe(JOB_HANDLERS.length);
    });
});
