import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { TreeReadingService } from '../../../structure/index.ts';
import {
    type ResidentRole,
    UnitMembershipEntity,
    type UnitMembershipSnapshot,
} from '../../domain/entities/unit-membership.entity.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import { UnitMembershipRepository } from '../../ports/unit-membership.repository.ts';
import '../membership.log-events.ts';

export type NewUnitMembership = {
    accountId: string;
    unitId: string;
    role: ResidentRole;
};

@Injectable()
export class UnitMembershipService {
    constructor(
        private readonly _memberships: UnitMembershipRepository,
        private readonly _tree: TreeReadingService,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async bind(
        tx: Tx,
        input: NewUnitMembership,
    ): Promise<UnitMembershipSnapshot> {
        const unit = await this._tree.findUnit(tx, input.unitId);
        if (unit === null) {
            throw new MembershipError(
                'MEMBERSHIP_UNIT_NOT_FOUND',
                'Unit is not found',
                { unitId: input.unitId },
            );
        }
        const membership = UnitMembershipEntity.start({
            id: this._ids.next(),
            accountId: input.accountId,
            unitId: unit.id,
            role: input.role,
            now: this._clock.now(),
        });
        const stored = await this._memberships.addOrFindActive(tx, membership);
        stored.acceptRepeat(membership);
        if (stored === membership) {
            this._events.info('membership.unit_bound', {
                membershipId: membership.view().id,
                accountId: input.accountId,
                unitId: unit.id,
                role: input.role,
            });
        }
        return stored.view();
    }

    async end(tx: Tx, membershipId: string): Promise<UnitMembershipSnapshot> {
        const membership = await this._memberships.lockById(tx, membershipId);
        if (membership === null) {
            throw new MembershipError(
                'MEMBERSHIP_UNIT_MEMBERSHIP_NOT_FOUND',
                'Unit membership is not found',
                { membershipId },
            );
        }
        if (!membership.end(this._clock.now())) {
            return membership.view();
        }
        await this._memberships.save(tx, membership);
        const ended = membership.view();
        this._events.info('membership.unit_unbound', {
            membershipId: ended.id,
            accountId: ended.accountId,
            unitId: ended.unitId,
        });
        return ended;
    }
}
