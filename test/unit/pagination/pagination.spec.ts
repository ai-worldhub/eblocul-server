import {
    decodeCursor,
    decodeUuidCursor,
    encodeCursor,
    PaginationError,
    toCursorPage,
} from '../../../src/shared/http/pagination.ts';

const base64url = (value: string): string =>
    Buffer.from(value).toString('base64url');

describe('app-pagination', () => {
    it('decodes what it encodes', () => {
        const key = {
            createdAt: new Date('2026-09-15T10:00:00.000Z'),
            id: 'doc-1',
        };

        expect(decodeCursor(encodeCursor(key))).toEqual(key);
    });

    it.each([
        ['not base64 json', 'not-a-cursor'],
        ['json array', base64url('[]')],
        ['missing id', base64url('{"createdAt":"2026-09-15T10:00:00.000Z"}')],
        ['invalid date', base64url('{"createdAt":"yesterday","id":"doc-1"}')],
    ])('rejects a cursor with %s', (_case, cursor) => {
        expect(() => decodeCursor(cursor)).toThrow(PaginationError);
    });

    it.each([
        ['an appended character outside base64url', '!'],
        ['an appended padding', '=='],
        ['a leading space', ' '],
    ])('rejects a valid cursor with %s', (_case, extra) => {
        const cursor = encodeCursor({
            createdAt: new Date('2026-09-15T10:00:00.000Z'),
            id: 'doc-1',
        });
        const corrupted =
            extra === ' ' ? `${extra}${cursor}` : `${cursor}${extra}`;

        expect(() => decodeCursor(corrupted)).toThrow(PaginationError);
    });

    it('cuts the extra row and points the cursor at the last item', () => {
        const rows = [3, 2, 1].map((minute) => ({
            createdAt: new Date(Date.UTC(2026, 8, 15, 10, minute)),
            id: `doc-${minute}`,
        }));

        const page = toCursorPage(rows, 2);

        expect(page.items.map(({ id }) => id)).toEqual(['doc-3', 'doc-2']);
        expect(page.nextCursor).not.toBeNull();
        expect(decodeCursor(page.nextCursor ?? '')).toEqual({
            createdAt: rows[1]?.createdAt,
            id: 'doc-2',
        });
    });

    it('has no next cursor on the last page', () => {
        const rows = [{ createdAt: new Date(), id: 'doc-1' }];

        expect(toCursorPage(rows, 2).nextCursor).toBeNull();
    });

    it('takes a cursor whose id is a uuid', () => {
        const key = {
            createdAt: new Date('2026-09-19T12:00:00.000Z'),
            id: '0199f0b1-4d7a-7c1e-9a2b-3c4d5e6f7a8b',
        };

        expect(decodeUuidCursor(encodeCursor(key))).toEqual(key);
    });

    it.each(['doc-1', '', '0199f0b1-4d7a-7c1e-9a2b-3c4d5e6f7a8'])(
        'refuses a cursor with id %s',
        (id) => {
            const cursor = encodeCursor({
                createdAt: new Date('2026-09-19T12:00:00.000Z'),
                id,
            });

            expect(() => decodeUuidCursor(cursor)).toThrow(PaginationError);
        },
    );
});
