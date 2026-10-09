import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { TreeReadingService } from '../../../structure/index.ts';
import type {
    NodeAssignmentEntity,
    NodeAssignmentSnapshot,
} from '../../domain/entities/node-assignment.entity.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import type { AssignmentRole } from '../../domain/rules/assignment-places.ts';
import type { ZoneReturnReason } from '../../domain/rules/zone-return-reasons.ts';
import { NodeAssignmentRepository } from '../../ports/node-assignment.repository.ts';
import '../membership.log-events.ts';
import { nodeOrRefuse } from '../node-lookup.ts';

const CHIEF: AssignmentRole = 'chief_administrator';

export type ZoneTakeover = {
    accountId: string;
    nodeId: string;
};

@Injectable()
export class ZoneTakeoverService {
    constructor(
        private readonly _assignments: NodeAssignmentRepository,
        private readonly _tree: TreeReadingService,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async takeZone(
        tx: Tx,
        input: ZoneTakeover,
    ): Promise<NodeAssignmentSnapshot> {
        const zone = await nodeOrRefuse(this._tree, tx, input.nodeId);
        const chief = await this._assignments.lockActive(tx, {
            accountId: input.accountId,
            nodeId: zone.complexId,
            role: CHIEF,
        });
        if (chief === null) {
            throw new MembershipError(
                'MEMBERSHIP_CHIEF_REQUIRED',
                'Only an active chief administrator of the quarter takes its zone',
                { nodeId: zone.id },
            );
        }
        const takeover = chief.takeZone({
            id: this._ids.next(),
            zone,
            now: this._clock.now(),
        });
        const stored = await this._assignments.addOrFindActive(tx, takeover);
        if (stored === takeover) {
            this._zoneTaken(stored.view());
        }
        return stored.view();
    }

    async returnZone(
        tx: Tx,
        takeoverId: string,
    ): Promise<NodeAssignmentSnapshot> {
        const takeover = await this._assignments.lockById(tx, takeoverId);
        if (takeover === null || !takeover.isTakeover()) {
            throw new MembershipError(
                'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                'Zone takeover is not found',
                { assignmentId: takeoverId },
            );
        }
        await this._end(tx, takeover, 'returned_by_chief');
        return takeover.view();
    }

    async releaseNode(tx: Tx, nodeId: string): Promise<void> {
        const takeovers = await this._assignments.lockActiveTakeoversOfNode(
            tx,
            nodeId,
        );
        for (const takeover of takeovers) {
            await this._end(tx, takeover, 'zone_administrator_assigned');
        }
    }

    async releaseAccount(
        tx: Tx,
        accountId: string,
        quarterId: string,
    ): Promise<void> {
        const takeovers = await this._assignments.lockActiveTakeoversOfAccount(
            tx,
            accountId,
            quarterId,
        );
        for (const takeover of takeovers) {
            await this._end(tx, takeover, 'chief_role_ended');
        }
    }

    private async _end(
        tx: Tx,
        takeover: NodeAssignmentEntity,
        reason: ZoneReturnReason,
    ): Promise<void> {
        if (!takeover.end(this._clock.now())) {
            return;
        }
        await this._assignments.save(tx, takeover);
        this._zoneReturned(takeover.view(), reason);
    }

    private _zoneTaken(takeover: NodeAssignmentSnapshot): void {
        this._events.info('membership.zone_taken', {
            assignmentId: takeover.id,
            accountId: takeover.accountId,
            nodeId: takeover.nodeId,
        });
    }

    private _zoneReturned(
        takeover: NodeAssignmentSnapshot,
        reason: ZoneReturnReason,
    ): void {
        this._events.info('membership.zone_returned', {
            assignmentId: takeover.id,
            accountId: takeover.accountId,
            nodeId: takeover.nodeId,
            reason,
        });
    }
}
