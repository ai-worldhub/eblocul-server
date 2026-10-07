import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock.service.ts';
import { DbService } from '../../../shared/db/db.service.ts';
import { Ids } from '../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../shared/logging/event-logger.ts';
import { normalizeEmail } from '../domain/email.ts';
import { assertPasswordAcceptable } from '../domain/password-policy.ts';
import { ACCOUNT_ID_SELECT } from '../infrastructure/account.select.ts';
import { PasswordHasher } from '../ports/password-hasher.port.ts';
import './identity.log-events.ts';

export type NewAccount = {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
};

@Injectable()
export class AccountService {
    constructor(
        private readonly _hasher: PasswordHasher,
        private readonly _db: DbService,
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
                phone: input.phone,
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
