import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    AttemptSeriesEntity,
    type AttemptSeriesSnapshot,
} from '../../domain/entities/attempt-series.entity.ts';
import type { AttemptSeriesRepository } from '../../ports/attempt-series.repository.ts';
import {
    ATTEMPT_SERIES_STATE_SELECT,
    type AttemptSeriesStateRow,
} from '../attempt-series.select.ts';

true satisfies [AttemptSeriesStateRow] extends [AttemptSeriesSnapshot]
    ? [AttemptSeriesSnapshot] extends [AttemptSeriesStateRow]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaAttemptSeriesRepository implements AttemptSeriesRepository {
    async lockByKeyOrAdd(
        tx: Tx,
        fresh: AttemptSeriesEntity,
    ): Promise<AttemptSeriesEntity> {
        const { id, key, failures, expiresAt } = fresh.view();
        const found = await tx.$queryRaw<Found[]>`
            INSERT INTO throttle.attempt_series (id, key, failures, expires_at)
            VALUES (${id}::uuid, ${key}, ${failures}, ${expiresAt})
            ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
            RETURNING id
        `;
        const row = await tx.attemptSeries.findUniqueOrThrow({
            where: { id: found[0]?.id ?? id },
            select: ATTEMPT_SERIES_STATE_SELECT,
        });
        return AttemptSeriesEntity.restore(row);
    }

    async save(tx: Tx, series: AttemptSeriesEntity): Promise<void> {
        const { id, failures, lockEndsAt, expiresAt } = series.view();
        await tx.attemptSeries.updateMany({
            where: { id },
            data: { failures, lockEndsAt, expiresAt },
        });
    }

    async removeByKey(tx: Tx, key: string): Promise<void> {
        await tx.attemptSeries.deleteMany({ where: { key } });
    }
}
