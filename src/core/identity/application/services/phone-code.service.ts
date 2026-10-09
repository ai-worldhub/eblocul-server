import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { JobQueueService, type JobRun } from '../../../jobs/index.ts';
import { defineRateLimit, RateLimitService } from '../../../throttle/index.ts';
import { PhoneCodeEntity } from '../../domain/entities/phone-code.entity.ts';
import { normalizePhone } from '../../domain/rules/phone.ts';
import {
    CODE_LIFETIME_SECONDS,
    CODE_RESEND_SECONDS,
    RESIDENT_CODE_RESEND,
} from '../../domain/rules/phone-code.ts';
import {
    nextPhoneCodePurgeAt,
    PHONE_CODE_PURGE_BATCH,
} from '../../domain/rules/phone-code-purge.ts';
import { PhoneCodeRepository } from '../../ports/phone-code.repository.ts';
import { VerificationCodeSender } from '../../ports/verification-code-sender.port.ts';
import { VerificationCodeSource } from '../../ports/verification-code-source.port.ts';
import { PURGE_PHONE_CODES } from '../identity.jobs.ts';
import '../identity.log-events.ts';
import { codeFingerprintOf } from '../session-fingerprint.ts';

const RESEND_PAUSE = defineRateLimit(RESIDENT_CODE_RESEND);

export type IssuedCode = {
    resendAfterSeconds: number;
    expiresInSeconds: number;
};

@Injectable()
export class PhoneCodeService {
    constructor(
        private readonly _codes: PhoneCodeRepository,
        private readonly _source: VerificationCodeSource,
        private readonly _sender: VerificationCodeSender,
        private readonly _rates: RateLimitService,
        private readonly _jobs: JobQueueService,
        private readonly _db: DbService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async issue(writtenPhone: string): Promise<IssuedCode> {
        const phone = normalizePhone(writtenPhone);
        await this._rates.spend(RESEND_PAUSE, phone);
        const id = this._ids.next();
        const secret = this._source.next();
        const now = this._clock.now();
        const code = PhoneCodeEntity.issue({
            id,
            phone,
            codeHash: codeFingerprintOf(id, secret),
            now,
        });
        await this._transactions.run(async (tx) => {
            await this._codes.removeByPhone(tx, phone);
            await this._codes.add(tx, code);
            await this._schedulePurge(tx, now);
        });
        await this._sender.send(phone, secret);
        this._events.info('identity.code_sent', { codeId: id });
        return {
            resendAfterSeconds: CODE_RESEND_SECONDS,
            expiresInSeconds: CODE_LIFETIME_SECONDS,
        };
    }

    async purge(run: JobRun): Promise<void> {
        const now = this._clock.now();
        let phoneCodes = 0;
        for (;;) {
            run.signal.throwIfAborted();
            const { count } = await this._db.phoneCode.deleteMany({
                where: { expiresAt: { lte: now } },
                limit: PHONE_CODE_PURGE_BATCH,
            });
            phoneCodes += count;
            if (count < PHONE_CODE_PURGE_BATCH) {
                break;
            }
        }
        await this._transactions.run(async (tx) => {
            if ((await tx.phoneCode.count({ take: 1 })) > 0) {
                await this._schedulePurge(tx, now);
            }
            await run.complete(tx);
        });
        this._events.info('identity.phone_codes_purged', { phoneCodes });
    }

    private async _schedulePurge(tx: Tx, now: Date): Promise<void> {
        const at = nextPhoneCodePurgeAt(now);
        await this._jobs.enqueue(
            tx,
            PURGE_PHONE_CODES,
            {},
            { notBefore: at, dedupKey: at.toISOString() },
        );
    }
}
