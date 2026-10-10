import { Injectable } from '@nestjs/common';
import { DbService } from './db.service.ts';
import type { Tx } from './tx.ts';

const MAX_WAIT_MS = 2000;
const TIMEOUT_MS = 5000;
const STATEMENT_TIMEOUT = String(TIMEOUT_MS);

@Injectable()
export class Transactions {
    constructor(private readonly _db: DbService) {}

    run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
        return this._db.$transaction(
            async (tx) => {
                await tx.$queryRaw`
                    SELECT set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)
                    FROM pg_settings
                    WHERE name = 'statement_timeout'
                      AND (
                          setting::integer = 0
                          OR setting::integer > ${STATEMENT_TIMEOUT}::integer
                      )
                `;
                return work(tx);
            },
            { maxWait: MAX_WAIT_MS, timeout: TIMEOUT_MS },
        );
    }
}
