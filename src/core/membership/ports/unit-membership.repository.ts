import type { Tx } from '../../../shared/db/tx.ts';
import type { UnitMembershipEntity } from '../domain/entities/unit-membership.entity.ts';

export abstract class UnitMembershipRepository {
    abstract addOrFindActive(
        tx: Tx,
        membership: UnitMembershipEntity,
    ): Promise<UnitMembershipEntity>;
    abstract lockById(
        tx: Tx,
        membershipId: string,
    ): Promise<UnitMembershipEntity | null>;
    abstract save(tx: Tx, membership: UnitMembershipEntity): Promise<void>;
}
