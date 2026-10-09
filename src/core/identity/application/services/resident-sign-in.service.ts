import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import {
    type Attempt,
    AttemptLockService,
    defineAttemptRule,
} from '../../../throttle/index.ts';
import {
    codeRefused,
    type CodeVerdict,
    pendingTokenInvalid,
} from '../../domain/entities/phone-code.entity.ts';
import type { SessionApplication } from '../../domain/entities/session.entity.ts';
import { normalizePersonName } from '../../domain/rules/person-name.ts';
import { normalizePhone } from '../../domain/rules/phone.ts';
import {
    type CodeOutcome,
    PENDING_LIFETIME_SECONDS,
    RESIDENT_CODE_ATTEMPTS,
} from '../../domain/rules/phone-code.ts';
import { PhoneCodeRepository } from '../../ports/phone-code.repository.ts';
import { SessionTokenSource } from '../../ports/session-token-source.port.ts';
import '../identity.log-events.ts';
import { codeFingerprintOf, fingerprintOf } from '../session-fingerprint.ts';
import { AccountService } from './account.service.ts';
import { ConsentService } from './consent.service.ts';
import { SessionService, type StartedSession } from './session.service.ts';

const RESIDENT_APP: SessionApplication = 'resident_app';
const CODE_ATTEMPTS = defineAttemptRule(RESIDENT_CODE_ATTEMPTS);
const DECOY_SALT = 'decoy';

type PendingSignIn = {
    token: string;
    expiresInSeconds: number;
    consentVersion: string;
};

export type CodeConfirmation =
    | { outcome: 'signed_in'; session: StartedSession }
    | {
          outcome: Exclude<CodeOutcome, 'signed_in'>;
          pending: PendingSignIn;
      };

export type CodeEntry = { phone: string; code: string };

export type PersonName = { firstName: string; lastName: string };

export type ConsentEntry = { pendingToken: string; consentVersion: string };

type Confirmed = {
    codeId: string;
    confirmation: CodeConfirmation;
    verifiedAccountId: string | null;
};

type Completed = {
    started: StartedSession;
    isAccountCreated: boolean;
};

@Injectable()
export class ResidentSignInService {
    constructor(
        private readonly _codes: PhoneCodeRepository,
        private readonly _accounts: AccountService,
        private readonly _consents: ConsentService,
        private readonly _sessions: SessionService,
        private readonly _tokens: SessionTokenSource,
        private readonly _attempts: AttemptLockService,
        private readonly _db: DbService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _events: EventLogger,
    ) {}

    async confirmCode(entry: CodeEntry): Promise<CodeConfirmation> {
        const phone = normalizePhone(entry.phone);
        const attempt = await this._attempts.begin(CODE_ATTEMPTS, phone);
        const now = this._clock.now();
        const stored = await this._codes.findByPhone(this._db, phone);
        const checked = attempt.isCounted ? stored : null;
        const fingerprint = codeFingerprintOf(
            checked?.view().id ?? DECOY_SALT,
            entry.code,
        );
        const verdict = checked?.verdictOn(fingerprint, now) ?? 'invalid';
        if (verdict !== 'matched') {
            throw this._refusal(attempt, verdict);
        }

        const confirmed = await this._transactions.run(
            async (tx): Promise<Confirmed> => {
                const code = await this._codes.lockByPhone(tx, phone);
                if (code === null) {
                    throw codeRefused('invalid');
                }
                const { id: codeId } = code.view();
                code.confirm(codeFingerprintOf(codeId, entry.code), now);
                await this._attempts.clear(tx, CODE_ATTEMPTS, phone);
                const account = await this._accounts.findForPhoneSignIn(
                    tx,
                    phone,
                );
                const verifiedAccountId =
                    account !== null &&
                    (await this._accounts.markPhoneVerified(
                        tx,
                        account.id,
                        now,
                    ))
                        ? account.id
                        : null;
                if (account !== null && account.consents.length > 0) {
                    await this._codes.remove(tx, code);
                    const session = await this._sessions.start(tx, {
                        accountId: account.id,
                        application: RESIDENT_APP,
                    });
                    return {
                        codeId,
                        confirmation: { outcome: 'signed_in', session },
                        verifiedAccountId,
                    };
                }
                const token = this._tokens.next();
                code.keepPending(fingerprintOf(token), now);
                await this._codes.save(tx, code);
                return {
                    codeId,
                    confirmation: {
                        outcome:
                            account === null
                                ? 'registration_required'
                                : 'consent_required',
                        pending: {
                            token,
                            expiresInSeconds: PENDING_LIFETIME_SECONDS,
                            consentVersion: this._consents.currentVersion(),
                        },
                    },
                    verifiedAccountId,
                };
            },
        );
        this._report(confirmed);
        return confirmed.confirmation;
    }

    async register(entry: ConsentEntry & PersonName): Promise<StartedSession> {
        return this._complete(entry, {
            firstName: normalizePersonName(entry.firstName),
            lastName: normalizePersonName(entry.lastName),
        });
    }

    async acceptConsent(entry: ConsentEntry): Promise<StartedSession> {
        return this._complete(entry, null);
    }

    private async _complete(
        entry: ConsentEntry,
        name: PersonName | null,
    ): Promise<StartedSession> {
        this._consents.assertCurrent(entry.consentVersion);
        const now = this._clock.now();
        const { started, isAccountCreated } = await this._transactions.run(
            async (tx): Promise<Completed> => {
                const code = await this._codes.lockByPendingTokenHash(
                    tx,
                    fingerprintOf(entry.pendingToken),
                );
                if (code === null) {
                    throw pendingTokenInvalid();
                }
                const phoneVerifiedAt = code.redeem(now);
                const { phone } = code.view();
                const existing = await this._accounts.findForPhoneSignIn(
                    tx,
                    phone,
                );
                const accountId =
                    existing?.id ??
                    (await this._register(tx, name, phone, phoneVerifiedAt));
                await this._consents.accept(tx, accountId);
                await this._codes.remove(tx, code);
                return {
                    started: await this._sessions.start(tx, {
                        accountId,
                        application: RESIDENT_APP,
                    }),
                    isAccountCreated: existing === null,
                };
            },
        );
        const { accountId, sessionId } = started.session;
        if (isAccountCreated) {
            this._events.info('identity.account_created', { accountId });
        }
        this._events.info('identity.consent_accepted', { accountId });
        this._events.info('identity.signed_in', {
            accountId,
            sessionId,
            application: RESIDENT_APP,
        });
        return started;
    }

    private _register(
        tx: Tx,
        name: PersonName | null,
        phone: string,
        phoneVerifiedAt: Date,
    ): Promise<string> {
        if (name === null) {
            throw pendingTokenInvalid();
        }
        return this._accounts.registerByPhone(tx, {
            firstName: name.firstName,
            lastName: name.lastName,
            phone,
            phoneVerifiedAt,
        });
    }

    private _report(confirmed: Confirmed): void {
        const { codeId, confirmation, verifiedAccountId } = confirmed;
        this._events.info('identity.code_confirmed', {
            codeId,
            outcome: confirmation.outcome,
        });
        if (verifiedAccountId !== null) {
            this._events.info('identity.phone_verified', {
                accountId: verifiedAccountId,
            });
        }
        if (confirmation.outcome === 'signed_in') {
            this._events.info('identity.signed_in', {
                accountId: confirmation.session.session.accountId,
                sessionId: confirmation.session.session.sessionId,
                application: RESIDENT_APP,
            });
        }
    }

    private _refusal(attempt: Attempt, verdict: CodeVerdict): Error {
        this._events.info(
            attempt.isCounted
                ? 'identity.sign_in_failed'
                : 'identity.sign_in_locked',
            { accountId: null, application: RESIDENT_APP },
        );
        return this._attempts.refusalOf(attempt) ?? codeRefused(verdict);
    }
}
