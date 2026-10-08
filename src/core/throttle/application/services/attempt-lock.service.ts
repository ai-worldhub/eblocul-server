import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { AttemptSeriesEntity } from '../../domain/entities/attempt-series.entity.ts';
import type { AttemptRule } from '../../domain/rules/attempt-rule.ts';
import {
    attemptsLocked,
    type ThrottleError,
} from '../../domain/throttle.errors.ts';
import { AttemptSeriesRepository } from '../../ports/attempt-series.repository.ts';
import { KeyFingerprint } from '../../ports/key-fingerprint.port.ts';
import '../throttle.log-events.ts';
import { PurgeService } from './purge.service.ts';

const SCOPE = 'attempts';

export type Attempt = {
    rule: string;
    isCounted: boolean;
    retryAfterSeconds: number | null;
};

@Injectable()
export class AttemptLockService {
    constructor(
        private readonly _series: AttemptSeriesRepository,
        private readonly _fingerprints: KeyFingerprint,
        private readonly _purge: PurgeService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async begin(rule: AttemptRule, subject: string): Promise<Attempt> {
        const now = this._clock.now();
        const key = this._keyOf(rule, subject);
        const outcome = await this._transactions.run(async (tx) => {
            const series = await this._series.lockByKeyOrAdd(
                tx,
                AttemptSeriesEntity.open({ id: this._ids.next(), key, now }),
            );
            const registered = series.register(rule, now);
            if (registered.isCounted) {
                await this._series.save(tx, series);
                await this._purge.schedule(tx, now);
            }
            return registered;
        });
        return { rule: rule.name, ...outcome };
    }

    refusalOf(attempt: Attempt): ThrottleError | null {
        if (attempt.retryAfterSeconds === null) {
            return null;
        }
        if (attempt.isCounted) {
            this._events.warn('throttle.attempts_locked', {
                rule: attempt.rule,
                lockSeconds: attempt.retryAfterSeconds,
            });
        }
        return attemptsLocked(attempt.retryAfterSeconds);
    }

    async clear(tx: Tx, rule: AttemptRule, subject: string): Promise<void> {
        await this._series.removeByKey(tx, this._keyOf(rule, subject));
    }

    private _keyOf(rule: AttemptRule, subject: string): string {
        return this._fingerprints.of(`${SCOPE}:${rule.name}`, subject);
    }
}
