import type { DbService } from '../../src/shared/db/db.service.ts';
import type { Transactions } from '../../src/shared/db/transactions.service.ts';
import type { Tx } from '../../src/shared/db/tx.ts';

const POLL_INTERVAL_MS = 20;
const BLOCK_TIMEOUT_MS = 2000;

export type Overlapped<A, B> = {
    first: A;
    second: PromiseSettledResult<B>;
};

export type Gate = { open: () => void; opened: Promise<void> };

export const gate = (): Gate => {
    let open: () => void = () => undefined;
    const opened = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { open, opened };
};

const isSomeoneWaitingForLock = async (db: DbService): Promise<boolean> => {
    const rows = await db.$queryRaw<{ waiting: bigint }[]>`
        SELECT count(*) AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
    `;
    return (rows[0]?.waiting ?? 0n) > 0n;
};

export const waitUntilBlocked = async (db: DbService): Promise<boolean> => {
    const deadline = Date.now() + BLOCK_TIMEOUT_MS;
    while (Date.now() <= deadline) {
        if (await isSomeoneWaitingForLock(db)) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return false;
};

export const runOverlapped = async <A, B>(input: {
    db: DbService;
    transactions: Transactions;
    first: (tx: Tx) => Promise<A>;
    second: (tx: Tx) => Promise<B>;
}): Promise<Overlapped<A, B>> => {
    const worked = gate();
    const release = gate();
    const first = input.transactions.run(async (tx) => {
        const result = await input.first(tx);
        worked.open();
        await release.opened;
        return result;
    });
    await Promise.race([worked.opened, first]);
    const second = input.transactions.run(input.second);
    second.catch(() => undefined);
    const isBlocked = await waitUntilBlocked(input.db);
    release.open();
    const [firstResult, secondResult] = await Promise.allSettled([
        first,
        second,
    ]);
    if (!isBlocked) {
        throw new Error(
            'The second transaction did not wait for the first one',
        );
    }
    if (firstResult.status === 'rejected') {
        throw firstResult.reason;
    }
    return { first: firstResult.value, second: secondResult };
};

export const fulfilledValueOf = <T>(result: PromiseSettledResult<T>): T => {
    if (result.status === 'rejected') {
        throw result.reason;
    }
    return result.value;
};
