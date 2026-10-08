import type { Tx } from '../../../shared/db/tx.ts';
import type { SessionEntity } from '../domain/entities/session.entity.ts';

export abstract class SessionRepository {
    abstract add(tx: Tx, session: SessionEntity): Promise<void>;
    abstract findByTokenHash(
        tx: Tx,
        tokenHash: string,
    ): Promise<SessionEntity | null>;
    abstract lockByTokenHash(
        tx: Tx,
        tokenHash: string,
    ): Promise<SessionEntity | null>;
    abstract save(tx: Tx, session: SessionEntity): Promise<void>;
}
