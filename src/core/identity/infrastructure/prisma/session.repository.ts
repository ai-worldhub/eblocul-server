import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    SessionEntity,
    type SessionSnapshot,
} from '../../domain/session.entity.ts';
import type { SessionRepository } from '../../ports/session.repository.ts';
import {
    SESSION_STATE_SELECT,
    type SessionStateRow,
} from '../session.select.ts';

true satisfies [SessionStateRow] extends [SessionSnapshot]
    ? [SessionSnapshot] extends [SessionStateRow]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
    async add(tx: Tx, session: SessionEntity): Promise<void> {
        await tx.session.create({ data: session.view() });
    }

    async findByTokenHash(
        tx: Tx,
        tokenHash: string,
    ): Promise<SessionEntity | null> {
        const row = await tx.session.findUnique({
            where: { tokenHash },
            select: SESSION_STATE_SELECT,
        });
        return row === null ? null : SessionEntity.restore(row);
    }

    async lockByTokenHash(
        tx: Tx,
        tokenHash: string,
    ): Promise<SessionEntity | null> {
        const found = await tx.$queryRaw<Found[]>`
            SELECT id
            FROM identity.sessions
            WHERE token_hash = ${tokenHash}
            FOR UPDATE
        `;
        const id = found[0]?.id;
        if (id === undefined) {
            return null;
        }
        const row = await tx.session.findUniqueOrThrow({
            where: { id },
            select: SESSION_STATE_SELECT,
        });
        return SessionEntity.restore(row);
    }

    async save(tx: Tx, session: SessionEntity): Promise<void> {
        const { id, lastActiveAt, expiresAt, endedAt } = session.view();
        await tx.session.updateMany({
            where: { id },
            data: { lastActiveAt, expiresAt, endedAt },
        });
    }
}
