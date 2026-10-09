import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    PhoneCodeEntity,
    type PhoneCodeSnapshot,
} from '../../domain/entities/phone-code.entity.ts';
import type { PhoneCodeRepository } from '../../ports/phone-code.repository.ts';
import {
    PHONE_CODE_STATE_SELECT,
    type PhoneCodeStateRow,
} from '../phone-code.select.ts';

true satisfies [PhoneCodeStateRow] extends [PhoneCodeSnapshot]
    ? [PhoneCodeSnapshot] extends [PhoneCodeStateRow]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaPhoneCodeRepository implements PhoneCodeRepository {
    async add(tx: Tx, code: PhoneCodeEntity): Promise<void> {
        await tx.phoneCode.create({ data: code.view() });
    }

    async findByPhone(tx: Tx, phone: string): Promise<PhoneCodeEntity | null> {
        const row = await tx.phoneCode.findUnique({
            where: { phone },
            select: PHONE_CODE_STATE_SELECT,
        });
        return row === null ? null : PhoneCodeEntity.restore(row);
    }

    lockByPhone(tx: Tx, phone: string): Promise<PhoneCodeEntity | null> {
        return this._lock(tx, Prisma.sql`phone = ${phone}`);
    }

    lockByPendingTokenHash(
        tx: Tx,
        pendingTokenHash: string,
    ): Promise<PhoneCodeEntity | null> {
        return this._lock(
            tx,
            Prisma.sql`pending_token_hash = ${pendingTokenHash}`,
        );
    }

    async save(tx: Tx, code: PhoneCodeEntity): Promise<void> {
        const { id, pendingTokenHash, expiresAt, confirmedAt } = code.view();
        await tx.phoneCode.updateMany({
            where: { id },
            data: { pendingTokenHash, expiresAt, confirmedAt },
        });
    }

    async remove(tx: Tx, code: PhoneCodeEntity): Promise<void> {
        await tx.phoneCode.deleteMany({ where: { id: code.view().id } });
    }

    async removeByPhone(tx: Tx, phone: string): Promise<void> {
        await tx.phoneCode.deleteMany({ where: { phone } });
    }

    private async _lock(
        tx: Tx,
        condition: Prisma.Sql,
    ): Promise<PhoneCodeEntity | null> {
        const found = await tx.$queryRaw<Found[]>`
            SELECT id
            FROM identity.phone_codes
            WHERE ${condition}
            FOR UPDATE
        `;
        const id = found[0]?.id;
        if (id === undefined) {
            return null;
        }
        const row = await tx.phoneCode.findUniqueOrThrow({
            where: { id },
            select: PHONE_CODE_STATE_SELECT,
        });
        return PhoneCodeEntity.restore(row);
    }
}
