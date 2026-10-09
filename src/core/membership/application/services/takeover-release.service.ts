import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { type JournalActor, JournalService } from '../../../journal/index.ts';
import type {
    NodeAssignmentEntity,
    NodeAssignmentSnapshot,
} from '../../domain/entities/node-assignment.entity.ts';
import type { ZoneReturnReason } from '../../domain/rules/zone-return-reasons.ts';
import { NodeAssignmentRepository } from '../../ports/node-assignment.repository.ts';
import { ZONE_RETURNED } from '../membership.journal-actions.ts';
import '../membership.log-events.ts';

@Injectable()
export class TakeoverReleaseService {
    constructor(
        private readonly _assignments: NodeAssignmentRepository,
        private readonly _journal: JournalService,
        private readonly _clock: Clock,
        private readonly _events: EventLogger,
    ) {}

    async end(
        tx: Tx,
        takeover: NodeAssignmentEntity,
        reason: ZoneReturnReason,
        actor: JournalActor,
    ): Promise<void> {
        if (!takeover.end(this._clock.now())) {
            return;
        }
        await this._assignments.save(tx, takeover);
        await this._zoneReturned(tx, takeover.view(), reason, actor);
    }

    async endOnZone(
        tx: Tx,
        zoneId: string,
        actor: JournalActor,
    ): Promise<void> {
        const takeovers = await this._assignments.lockActiveTakeoversOfNode(
            tx,
            zoneId,
        );
        for (const takeover of takeovers) {
            await this.end(tx, takeover, 'zone_administrator_assigned', actor);
        }
    }

    async endOfChief(
        tx: Tx,
        accountId: string,
        quarterId: string,
        actor: JournalActor,
    ): Promise<void> {
        const takeovers = await this._assignments.lockActiveTakeoversOfAccount(
            tx,
            accountId,
            quarterId,
        );
        for (const takeover of takeovers) {
            await this.end(tx, takeover, 'chief_role_ended', actor);
        }
    }

    private async _zoneReturned(
        tx: Tx,
        takeover: NodeAssignmentSnapshot,
        reason: ZoneReturnReason,
        actor: JournalActor,
    ): Promise<void> {
        await this._journal.record(tx, ZONE_RETURNED, {
            actor,
            nodeId: takeover.nodeId,
            subjectAccountId: takeover.accountId,
            details: { assignmentId: takeover.id, reason },
        });
        this._events.info('membership.zone_returned', {
            assignmentId: takeover.id,
            accountId: takeover.accountId,
            nodeId: takeover.nodeId,
            reason,
        });
    }
}
