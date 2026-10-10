import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { normalizeEmail } from '../../domain/rules/email.ts';
import { assertPasswordAcceptable } from '../../domain/rules/password-policy.ts';
import { normalizePhone } from '../../domain/rules/phone.ts';
import type { ProfileLanguage } from '../../domain/rules/profile-language.ts';
import {
    ACCOUNT_ID_SELECT,
    ACCOUNT_NAME_SELECT,
    ACCOUNT_PHONE_SIGN_IN_SELECT,
    type AccountName,
    type AccountPhoneSignIn,
} from '../../infrastructure/account.select.ts';
import { PasswordHasher } from '../../ports/password-hasher.port.ts';
import '../identity.log-events.ts';
import { ConsentService } from './consent.service.ts';

export type NewAccount = {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
};

export type NewPhoneAccount = {
    firstName: string;
    lastName: string;
    phone: string;
    language: ProfileLanguage;
};

@Injectable()
export class AccountService {
    constructor(
        private readonly _hasher: PasswordHasher,
        private readonly _consents: ConsentService,
        private readonly _db: DbService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async findIdByEmail(email: string): Promise<string | null> {
        const account = await this._db.account.findUnique({
            where: { email: normalizeEmail(email) },
            select: ACCOUNT_ID_SELECT,
        });
        return account?.id ?? null;
    }

    async findIdByPhone(phone: string): Promise<string | null> {
        const account = await this._db.account.findUnique({
            where: { phone: normalizePhone(phone) },
            select: ACCOUNT_ID_SELECT,
        });
        return account?.id ?? null;
    }

    findForPhoneSignIn(
        tx: Tx,
        phone: string,
    ): Promise<AccountPhoneSignIn | null> {
        return tx.account.findUnique({
            where: { phone },
            select: ACCOUNT_PHONE_SIGN_IN_SELECT,
        });
    }

    async markPhoneVerified(
        tx: Tx,
        accountId: string,
        at: Date,
    ): Promise<boolean> {
        const { count } = await tx.account.updateMany({
            where: { id: accountId, phoneVerifiedAt: null },
            data: { phoneVerifiedAt: at },
        });
        return count > 0;
    }

    async registerByPhone(
        tx: Tx,
        input: NewPhoneAccount & { phoneVerifiedAt: Date },
    ): Promise<string> {
        const id = this._ids.next();
        await tx.account.create({
            data: {
                id,
                firstName: input.firstName,
                lastName: input.lastName,
                phone: normalizePhone(input.phone),
                email: null,
                language: input.language,
                createdAt: this._clock.now(),
                phoneVerifiedAt: input.phoneVerifiedAt,
            },
        });
        return id;
    }

    async createWithConfirmedPhone(input: NewPhoneAccount): Promise<string> {
        const id = await this._transactions.run(async (tx) => {
            const accountId = await this.registerByPhone(tx, {
                ...input,
                phoneVerifiedAt: this._clock.now(),
            });
            await this._consents.accept(tx, accountId);
            return accountId;
        });
        this._events.info('identity.account_created', { accountId: id });
        this._events.info('identity.consent_accepted', { accountId: id });
        return id;
    }

    async findNames(accountIds: readonly string[]): Promise<AccountName[]> {
        if (accountIds.length === 0) {
            return [];
        }
        return this._db.account.findMany({
            where: { id: { in: [...accountIds] } },
            select: ACCOUNT_NAME_SELECT,
        });
    }

    async createWithPassword(input: NewAccount): Promise<string> {
        assertPasswordAcceptable(input.password);
        const hash = await this._hasher.hash(input.password);
        const id = this._ids.next();
        const now = this._clock.now();
        await this._db.account.create({
            data: {
                id,
                firstName: input.firstName,
                lastName: input.lastName,
                phone: normalizePhone(input.phone),
                email: normalizeEmail(input.email),
                createdAt: now,
                phoneVerifiedAt: null,
                password: { create: { hash, changedAt: now } },
            },
        });
        this._events.info('identity.account_created', { accountId: id });
        return id;
    }
}
