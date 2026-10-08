import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import { bucketHorizon } from '../../domain/rules/rate-limit.ts';
import type {
    RateBucketRepository,
    TokenOutcome,
    TokenRequest,
} from '../../ports/rate-bucket.repository.ts';

type Taken = { full_at: Date; is_new: boolean; is_taken: boolean };

@Injectable()
export class PrismaRateBucketRepository implements RateBucketRepository {
    async takeToken(tx: Tx, request: TokenRequest): Promise<TokenOutcome> {
        const { id, key, limit, now } = request;
        const fresh = new Date(now.getTime() + limit.intervalMs);
        const horizon = bucketHorizon(limit, now);
        const rows = await tx.$queryRaw<Taken[]>`
            WITH taken AS (
                INSERT INTO throttle.rate_buckets (id, key, full_at)
                VALUES (${id}::uuid, ${key}, ${fresh}::timestamptz)
                ON CONFLICT (key) DO UPDATE
                SET full_at = GREATEST(rate_buckets.full_at, ${now}::timestamptz)
                    + ${limit.intervalMs}::double precision * interval '1 millisecond'
                WHERE GREATEST(rate_buckets.full_at, ${now}::timestamptz)
                    + ${limit.intervalMs}::double precision * interval '1 millisecond'
                    <= ${horizon}::timestamptz
                RETURNING full_at, (xmax = 0) AS is_new
            )
            SELECT full_at, is_new, true AS is_taken
            FROM taken
            UNION ALL
            SELECT full_at, false AS is_new, false AS is_taken
            FROM throttle.rate_buckets
            WHERE key = ${key}
              AND NOT EXISTS (SELECT 1 FROM taken)
        `;
        const row = rows[0];
        return row === undefined
            ? { isTaken: false, isNew: false, fullAt: null }
            : {
                  isTaken: row.is_taken,
                  isNew: row.is_new,
                  fullAt: row.full_at,
              };
    }
}
