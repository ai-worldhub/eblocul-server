import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import type {
    NodeAssignmentEntity,
    NodeAssignmentSnapshot,
} from '../../domain/entities/node-assignment.entity.ts';
import type { ZoneReturnReason } from '../../domain/rules/zone-return-reasons.ts';
import { NodeAssignmentRepository } from '../../ports/node-assignment.repository.ts';
import '../membership.log-events.ts';

@Injectable()
export class TakeoverReleaseService {
    constructor(
        private readonly _assignments: NodeAssignmentRepository,
        private readonly _clock: Clock,
        private readonly _events: EventLogger,
    ) {}

    async end(
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

    async endOnZone(tx: Tx, zoneId: string): Promise<void> {
        const takeovers = await this._assignments.lockActiveTakeoversOfNode(
            tx,
            zoneId,
        );
        for (const takeover of takeovers) {
            await this.end(tx, takeover, 'zone_administrator_assigned');
        }
    }

    async endOfChief(
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
            await this.end(tx, takeover, 'chief_role_ended');
        }
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
