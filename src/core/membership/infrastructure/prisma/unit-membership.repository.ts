import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    UnitMembershipEntity,
    type UnitMembershipSnapshot,
} from '../../domain/entities/unit-membership.entity.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import type { UnitMembershipRepository } from '../../ports/unit-membership.repository.ts';
import {
    UNIT_MEMBERSHIP_STATE_SELECT,
    type UnitMembershipStateRow,
} from '../unit-membership.select.ts';
import { refuseMissingAccount } from './missing-account.ts';

true satisfies [UnitMembershipStateRow] extends [UnitMembershipSnapshot]
    ? [UnitMembershipSnapshot] extends [UnitMembershipStateRow]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaUnitMembershipRepository implements UnitMembershipRepository {
    async addOrFindActive(
        tx: Tx,
        membership: UnitMembershipEntity,
    ): Promise<UnitMembershipEntity> {
        const row = membership.view();
        const { count } = await tx.unitMembership
            .createMany({ data: [row], skipDuplicates: true })
            .catch((error: unknown) =>
                refuseMissingAccount(error, row.accountId),
            );
        if (count === 1) {
            return membership;
        }
        const active = await tx.unitMembership.findFirst({
            where: {
                accountId: row.accountId,
                unitId: row.unitId,
                endedAt: null,
            },
            select: UNIT_MEMBERSHIP_STATE_SELECT,
        });
        if (active === null) {
            throw new MembershipError(
                'MEMBERSHIP_CHANGED_CONCURRENTLY',
                'The unit membership changed during the request: repeat it',
            );
        }
        return UnitMembershipEntity.restore(active);
    }

    async lockById(
        tx: Tx,
        membershipId: string,
    ): Promise<UnitMembershipEntity | null> {
        const found = await tx.$queryRaw<Found[]>`
            SELECT id
            FROM membership.unit_memberships
            WHERE id = ${membershipId}::uuid
            FOR UPDATE
        `;
        const id = found[0]?.id;
        if (id === undefined) {
            return null;
        }
        const row = await tx.unitMembership.findUniqueOrThrow({
            where: { id },
            select: UNIT_MEMBERSHIP_STATE_SELECT,
        });
        return UnitMembershipEntity.restore(row);
    }

    async save(tx: Tx, membership: UnitMembershipEntity): Promise<void> {
        const { id, endedAt } = membership.view();
        await tx.unitMembership.updateMany({
            where: { id },
            data: { endedAt },
        });
    }
}
