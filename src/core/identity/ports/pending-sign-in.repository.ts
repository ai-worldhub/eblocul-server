import type { Tx } from '../../../shared/db/tx.ts';
import type { PendingSignInEntity } from '../domain/entities/pending-sign-in.entity.ts';

export abstract class PendingSignInRepository {
    abstract add(tx: Tx, pending: PendingSignInEntity): Promise<void>;
    abstract lockByTokenHash(
        tx: Tx,
        tokenHash: string,
    ): Promise<PendingSignInEntity | null>;
    abstract remove(tx: Tx, pending: PendingSignInEntity): Promise<void>;
    abstract removeByPhone(tx: Tx, phone: string): Promise<void>;
}
