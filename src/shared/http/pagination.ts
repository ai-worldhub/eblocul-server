export type CursorKey = {
    createdAt: Date;
    id: string;
};

export type CursorPage<T> = {
    items: T[];
    nextCursor: string | null;
};

export const DEFAULT_LIMIT = 20;

export class PaginationError extends Error {
    readonly code = 'INVALID_CURSOR';

    constructor() {
        super('Cursor is malformed');
        this.name = 'PaginationError';
    }
}

export const PaginationErrorStatuses = {
    INVALID_CURSOR: 400,
} satisfies Record<PaginationError['code'], number>;

export const encodeCursor = (key: CursorKey): string =>
    Buffer.from(
        JSON.stringify({ createdAt: key.createdAt.toISOString(), id: key.id }),
    ).toString('base64url');

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

export const decodeCursor = (cursor: string): CursorKey => {
    const parsed = parseJson(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
        const { createdAt, id } = parsed as {
            createdAt?: unknown;
            id?: unknown;
        };
        if (typeof createdAt === 'string' && typeof id === 'string') {
            const key = { createdAt: new Date(createdAt), id };
            if (
                !Number.isNaN(key.createdAt.getTime()) &&
                encodeCursor(key) === cursor
            ) {
                return key;
            }
        }
    }
    throw new PaginationError();
};

export const toCursorPageBy = <T>(
    rows: T[],
    limit: number,
    key: (row: T) => CursorKey,
): CursorPage<T> => {
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
        items,
        nextCursor:
            rows.length > limit && last !== undefined
                ? encodeCursor(key(last))
                : null,
    };
};

export const toCursorPage = <T extends CursorKey>(
    rows: T[],
    limit: number,
): CursorPage<T> => toCursorPageBy(rows, limit, (row) => row);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const decodeUuidCursor = (cursor: string): CursorKey => {
    const key = decodeCursor(cursor);
    if (!UUID.test(key.id)) {
        throw new PaginationError();
    }
    return key;
};
