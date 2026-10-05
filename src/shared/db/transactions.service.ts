import { Injectable } from '@nestjs/common';
import { DbService } from './db.service.ts';
import type { Tx } from './tx.ts';

const MAX_WAIT_MS = 2000;
const TIMEOUT_MS = 5000;

@Injectable()
export class Transactions {
    constructor(private readonly _db: DbService) {}

    run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
        return this._db.$transaction(work, {
            maxWait: MAX_WAIT_MS,
            timeout: TIMEOUT_MS,
        });
    }
}
