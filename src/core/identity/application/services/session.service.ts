import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import { Transactions } from '../../../../shared/db/transactions.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import {
    type SessionApplication,
    type SessionContext,
    SessionEntity,
    sessionIdleSeconds,
    sessionRequired,
    type SessionTransport,
} from '../../domain/entities/session.entity.ts';
import { SessionRepository } from '../../ports/session.repository.ts';
import { SessionTokenSource } from '../../ports/session-token-source.port.ts';
import '../identity.log-events.ts';
import { fingerprintOf } from '../session-fingerprint.ts';

export type PresentedSession = {
    token: string;
    transport: SessionTransport;
};

export type StartedSession = {
    token: string;
    session: SessionContext;
    idleSeconds: number;
};

export type AuthenticatedSession = {
    session: SessionContext;
    idleSeconds: number;
    isRenewed: boolean;
};

@Injectable()
export class SessionService {
    constructor(
        private readonly _sessions: SessionRepository,
        private readonly _tokens: SessionTokenSource,
        private readonly _db: DbService,
        private readonly _transactions: Transactions,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async start(
        tx: Tx,
        input: { accountId: string; application: SessionApplication },
    ): Promise<StartedSession> {
        const token = this._tokens.next();
        const session = SessionEntity.start({
            id: this._ids.next(),
            accountId: input.accountId,
            tokenHash: fingerprintOf(token),
            application: input.application,
            now: this._clock.now(),
        });
        await this._sessions.add(tx, session);
        return {
            token,
            session: session.context(),
            idleSeconds: sessionIdleSeconds(input.application),
        };
    }

    async authenticate(
        presented: PresentedSession,
    ): Promise<AuthenticatedSession> {
        const now = this._clock.now();
        const tokenHash = fingerprintOf(presented.token);
        const session = await this._sessions.findByTokenHash(
            this._db,
            tokenHash,
        );
        if (session === null) {
            throw sessionRequired();
        }
        session.authenticate(presented.transport, now);
        const context = session.context();
        return {
            session: context,
            idleSeconds: sessionIdleSeconds(context.application),
            isRenewed: session.isRenewalDue(now)
                ? await this._renew(tokenHash, now)
                : false,
        };
    }

    async end(presented: PresentedSession): Promise<void> {
        const now = this._clock.now();
        const ended = await this._transactions.run(async (tx) => {
            const session = await this._sessions.lockByTokenHash(
                tx,
                fingerprintOf(presented.token),
            );
            if (session === null || !session.end(presented.transport, now)) {
                return null;
            }
            await this._sessions.save(tx, session);
            return session.context();
        });
        if (ended !== null) {
            this._events.info('identity.signed_out', {
                accountId: ended.accountId,
                sessionId: ended.sessionId,
            });
        }
    }

    private async _renew(tokenHash: string, now: Date): Promise<boolean> {
        const renewed = await this._transactions.run(async (tx) => {
            const session = await this._sessions.lockByTokenHash(tx, tokenHash);
            if (session === null || !session.renew(now)) {
                return null;
            }
            await this._sessions.save(tx, session);
            return session.context();
        });
        if (renewed === null) {
            return false;
        }
        this._events.info('identity.session_renewed', {
            accountId: renewed.accountId,
            sessionId: renewed.sessionId,
        });
        return true;
    }
}
