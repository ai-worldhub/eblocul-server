import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import {
    type RateLimit,
    retryAfterSecondsOf,
} from '../../domain/rules/rate-limit.ts';
import { rateLimited } from '../../domain/throttle.errors.ts';
import { KeyFingerprint } from '../../ports/key-fingerprint.port.ts';
import { RateBucketRepository } from '../../ports/rate-bucket.repository.ts';
import '../throttle.log-events.ts';
import { PurgeService } from './purge.service.ts';

const SCOPE = 'rate';

@Injectable()
export class RateLimitService {
    constructor(
        private readonly _buckets: RateBucketRepository,
        private readonly _fingerprints: KeyFingerprint,
        private readonly _purge: PurgeService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async spend(limit: RateLimit, subject: string): Promise<void> {
        const now = this._clock.now();
        const key = this._fingerprints.of(`${SCOPE}:${limit.group}`, subject);
        const outcome = await this._transactions.run(async (tx) => {
            const taken = await this._buckets.takeToken(tx, {
                id: this._ids.next(),
                key,
                limit,
                now,
            });
            if (taken.isNew) {
                await this._purge.schedule(tx, now);
            }
            return taken;
        });
        if (outcome.isTaken) {
            return;
        }
        const retryAfterSeconds = retryAfterSecondsOf(
            limit,
            outcome.fullAt,
            now,
        );
        this._events.info('throttle.rate_limited', {
            group: limit.group,
            retryAfterSeconds,
        });
        throw rateLimited(retryAfterSeconds);
    }
}
