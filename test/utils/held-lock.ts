import type { DbService } from '../../src/shared/db/db.service.ts';
import type { Tx } from '../../src/shared/db/tx.ts';
import { gate, waitUntilBlocked } from './overlapped-transactions.ts';

const HOLD_LIMIT_MS = 30_000;
const STATEMENT_TIMEOUT_CODE = '57014';

export const CUT_OFF_BY_STATEMENT_LIMIT = {
    meta: {
        driverAdapterError: {
            cause: { originalCode: STATEMENT_TIMEOUT_CODE },
        },
    },
};

export type HeldLock = {
    untilSomeoneWaits: () => Promise<void>;
    release: () => Promise<void>;
};

export const holdLock = async (
    db: DbService,
    take: (tx: Tx) => Promise<unknown>,
): Promise<HeldLock> => {
    const taken = gate();
    const released = gate();
    const holder = db.$transaction(
        async (tx) => {
            await take(tx);
            taken.open();
            await released.opened;
        },
        { timeout: HOLD_LIMIT_MS },
    );
    await Promise.race([taken.opened, holder]);
    return {
        untilSomeoneWaits: async () => {
            if (!(await waitUntilBlocked(db))) {
                throw new Error('Nobody waited for the held lock');
            }
        },
        release: async () => {
            released.open();
            await holder;
        },
    };
};
