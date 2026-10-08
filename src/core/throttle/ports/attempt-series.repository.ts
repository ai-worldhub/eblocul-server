import type { Tx } from '../../../shared/db/tx.ts';
import type { AttemptSeriesEntity } from '../domain/entities/attempt-series.entity.ts';

export abstract class AttemptSeriesRepository {
    abstract lockByKeyOrAdd(
        tx: Tx,
        fresh: AttemptSeriesEntity,
    ): Promise<AttemptSeriesEntity>;
    abstract save(tx: Tx, series: AttemptSeriesEntity): Promise<void>;
    abstract removeByKey(tx: Tx, key: string): Promise<void>;
}
