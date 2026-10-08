import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { JobQueueService, type JobRun } from '../../../jobs/index.ts';
import { nextPurgeAt, PURGE_BATCH } from '../../domain/rules/purge-schedule.ts';
import { PURGE_EXPIRED } from '../throttle.jobs.ts';
import '../throttle.log-events.ts';

@Injectable()
export class PurgeService {
    constructor(
        private readonly _jobs: JobQueueService,
        private readonly _db: DbService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _events: EventLogger,
    ) {}

    async schedule(tx: Tx, now: Date): Promise<void> {
        const at = nextPurgeAt(now);
        await this._jobs.enqueue(
            tx,
            PURGE_EXPIRED,
            {},
            { notBefore: at, dedupKey: at.toISOString() },
        );
    }

    async purge(run: JobRun): Promise<void> {
        const now = this._clock.now();
        const rateBuckets = await this._deleteInBatches(run, (limit) =>
            this._db.rateBucket.deleteMany({
                where: { fullAt: { lte: now } },
                limit,
            }),
        );
        const attemptSeries = await this._deleteInBatches(run, (limit) =>
            this._db.attemptSeries.deleteMany({
                where: { expiresAt: { lte: now } },
                limit,
            }),
        );
        await this._transactions.run(async (tx) => {
            const isAnyLeft =
                (await tx.rateBucket.count({ take: 1 })) > 0 ||
                (await tx.attemptSeries.count({ take: 1 })) > 0;
            if (isAnyLeft) {
                await this.schedule(tx, now);
            }
            await run.complete(tx);
        });
        this._events.info('throttle.expired_purged', {
            rateBuckets,
            attemptSeries,
        });
    }

    private async _deleteInBatches(
        run: JobRun,
        deleteBatch: (limit: number) => Promise<{ count: number }>,
    ): Promise<number> {
        let deleted = 0;
        for (;;) {
            run.signal.throwIfAborted();
            const { count } = await deleteBatch(PURGE_BATCH);
            deleted += count;
            if (count < PURGE_BATCH) {
                return deleted;
            }
        }
    }
}
