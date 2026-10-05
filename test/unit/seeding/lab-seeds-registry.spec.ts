import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAB_SEEDS } from '../../../src/app/lab-seeds.ts';
import {
    LabSeed,
    type LabSeedType,
} from '../../../src/shared/seeding/lab-seed.ts';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));
const SEED_FILE = '.seed.ts';
const GENERATED = 'generated';

const seedFiles = (): string[] =>
    readdirSync(SRC, { recursive: true, encoding: 'utf8' })
        .filter(
            (file) => file.endsWith(SEED_FILE) && !file.startsWith(GENERATED),
        )
        .map((file) => join(SRC, file));

const isSeedType = (value: unknown): value is LabSeedType =>
    typeof value === 'function' &&
    Object.prototype.isPrototypeOf.call(LabSeed, value);

const declaredSeeds = async (): Promise<
    { file: string; type: LabSeedType }[]
> => {
    const declared: { file: string; type: LabSeedType }[] = [];
    for (const file of seedFiles()) {
        const exported = (await import(file)) as Record<string, unknown>;
        const types = Object.values(exported).filter(isSeedType);

        expect(types.length, `${file}: exports no seed`).toBeGreaterThan(0);
        declared.push(...types.map((type) => ({ file, type })));
    }
    return declared;
};

describe('LAB_SEEDS', () => {
    it('includes every seed of every module', async () => {
        for (const { file, type } of await declaredSeeds()) {
            expect(
                LAB_SEEDS.includes(type),
                `${type.name} from ${file} is not in the registry`,
            ).toBe(true);
        }
    });

    it('lists only seeds declared in *.seed.ts files', async () => {
        const declared = (await declaredSeeds()).map(({ type }) => type);

        expect(
            LAB_SEEDS.filter((type) => !declared.includes(type)).map(
                (type) => type.name,
            ),
        ).toEqual([]);
    });

    it('lists every seed once', () => {
        expect(new Set(LAB_SEEDS).size).toBe(LAB_SEEDS.length);
    });
});
