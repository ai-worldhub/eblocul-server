import { UuidV7Ids } from '../../../src/shared/ids/ids.service.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SECOND = 1000;

const stampOf = (id: string): number =>
    Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);

describe('UuidV7Ids', () => {
    const ids = new UuidV7Ids();

    it('writes a well formed v7', () => {
        const id = ids.next();

        expect(id).toMatch(UUID);
        expect(id[14]).toBe('7');
        expect(['8', '9', 'a', 'b']).toContain(id[19]);
    });

    it('carries the time it was made', () => {
        const before = Date.now();

        const stamp = stampOf(ids.next());

        expect(stamp).toBeGreaterThanOrEqual(before);
        expect(stamp).toBeLessThan(before + SECOND);
    });

    // A thousand in a row land in the same millisecond or two: a generator
    // without a sequence counter fails here.
    it('sorts in the order it was made, inside one millisecond as well', () => {
        const made = Array.from({ length: 1000 }, () => ids.next());

        expect(new Set(made).size).toBe(made.length);
        expect(made).toEqual([...made].sort());
    });
});
