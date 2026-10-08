import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DbService } from '../../../../shared/db/db.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { normalizeEmail } from '../../domain/rules/email.ts';
import { IdentityError } from '../../domain/identity.errors.ts';
import type { SessionApplication } from '../../domain/entities/session.entity.ts';
import { ACCOUNT_SIGN_IN_SELECT } from '../../infrastructure/account.select.ts';
import { PasswordHasher } from '../../ports/password-hasher.port.ts';
import { SessionTokenSource } from '../../ports/session-token-source.port.ts';
import '../identity.log-events.ts';
import { SessionService, type StartedSession } from './session.service.ts';

const ADMIN_PANEL: SessionApplication = 'admin_panel';

export type PasswordSignIn = {
    email: string;
    password: string;
};

@Injectable()
export class SignInService implements OnModuleInit {
    private _decoyHash = '';

    constructor(
        private readonly _sessions: SessionService,
        private readonly _hasher: PasswordHasher,
        private readonly _tokens: SessionTokenSource,
        private readonly _db: DbService,
        private readonly _transactions: Transactions,
        private readonly _events: EventLogger,
    ) {}

    async onModuleInit(): Promise<void> {
        this._decoyHash = await this._hasher.hash(this._tokens.next());
    }

    async signInToAdminPanel(input: PasswordSignIn): Promise<StartedSession> {
        const account = await this._db.account.findUnique({
            where: { email: normalizeEmail(input.email) },
            select: ACCOUNT_SIGN_IN_SELECT,
        });
        const hash = account?.password?.hash ?? null;
        const isVerified = await this._hasher.verify(
            input.password,
            hash ?? this._decoyHash,
        );
        if (account === null || hash === null || !isVerified) {
            this._events.info('identity.sign_in_failed', {
                accountId: account?.id ?? null,
                application: ADMIN_PANEL,
            });
            throw new IdentityError(
                'IDENTITY_CREDENTIALS_INVALID',
                'Email or password is incorrect',
            );
        }

        const rehashed = this._hasher.needsRehash(hash)
            ? await this._hasher.hash(input.password)
            : null;
        const started = await this._transactions.run(async (tx) => {
            if (rehashed !== null) {
                await tx.accountPassword.updateMany({
                    where: { accountId: account.id, hash },
                    data: { hash: rehashed },
                });
            }
            return this._sessions.start(tx, {
                accountId: account.id,
                application: ADMIN_PANEL,
            });
        });
        this._events.info('identity.signed_in', {
            accountId: started.session.accountId,
            sessionId: started.session.sessionId,
            application: ADMIN_PANEL,
        });
        return started;
    }
}
