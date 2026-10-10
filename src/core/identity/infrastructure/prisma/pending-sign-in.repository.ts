import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    PendingSignInEntity,
    type PendingSignInSnapshot,
} from '../../domain/entities/pending-sign-in.entity.ts';
import type { PendingSignInRepository } from '../../ports/pending-sign-in.repository.ts';
import {
    PENDING_SIGN_IN_STATE_SELECT,
    type PendingSignInStateRow,
} from '../pending-sign-in.select.ts';

true satisfies [PendingSignInStateRow] extends [PendingSignInSnapshot]
    ? [PendingSignInSnapshot] extends [PendingSignInStateRow]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaPendingSignInRepository implements PendingSignInRepository {
    async add(tx: Tx, pending: PendingSignInEntity): Promise<void> {
        await tx.pendingSignIn.create({ data: pending.view() });
    }

    async lockByTokenHash(
        tx: Tx,
        tokenHash: string,
    ): Promise<PendingSignInEntity | null> {
        const found = await tx.$queryRaw<Found[]>`
            SELECT id
            FROM identity.pending_sign_ins
            WHERE token_hash = ${tokenHash}
            FOR UPDATE
        `;
        const id = found[0]?.id;
        if (id === undefined) {
            return null;
        }
        const row = await tx.pendingSignIn.findUniqueOrThrow({
            where: { id },
            select: PENDING_SIGN_IN_STATE_SELECT,
        });
        return PendingSignInEntity.restore(row);
    }

    async remove(tx: Tx, pending: PendingSignInEntity): Promise<void> {
        await tx.pendingSignIn.deleteMany({
            where: { id: pending.view().id },
        });
    }

    async removeByPhone(tx: Tx, phone: string): Promise<void> {
        await tx.pendingSignIn.deleteMany({ where: { phone } });
    }
}
