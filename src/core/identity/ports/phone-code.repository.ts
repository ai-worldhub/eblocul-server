import type { Tx } from '../../../shared/db/tx.ts';
import type { PhoneCodeEntity } from '../domain/entities/phone-code.entity.ts';

export abstract class PhoneCodeRepository {
    abstract add(tx: Tx, code: PhoneCodeEntity): Promise<void>;
    abstract findByPhone(
        tx: Tx,
        phone: string,
    ): Promise<PhoneCodeEntity | null>;
    abstract lockByPhone(
        tx: Tx,
        phone: string,
    ): Promise<PhoneCodeEntity | null>;
    abstract lockByPendingTokenHash(
        tx: Tx,
        pendingTokenHash: string,
    ): Promise<PhoneCodeEntity | null>;
    abstract save(tx: Tx, code: PhoneCodeEntity): Promise<void>;
    abstract remove(tx: Tx, code: PhoneCodeEntity): Promise<void>;
    abstract removeByPhone(tx: Tx, phone: string): Promise<void>;
}
