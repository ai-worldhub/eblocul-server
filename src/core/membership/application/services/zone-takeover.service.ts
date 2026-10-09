import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { type JournalActor, JournalService } from '../../../journal/index.ts';
import { TreeReadingService } from '../../../structure/index.ts';
import {
    chiefRequired,
    type NodeAssignmentSnapshot,
} from '../../domain/entities/node-assignment.entity.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import type { AssignmentRole } from '../../domain/rules/assignment-places.ts';
import { NodeAssignmentRepository } from '../../ports/node-assignment.repository.ts';
import { ZONE_TAKEN } from '../membership.journal-actions.ts';
import '../membership.log-events.ts';
import { lockedNodeOrRefuse } from '../node-lookup.ts';
import { TakeoverReleaseService } from './takeover-release.service.ts';

const CHIEF: AssignmentRole = 'chief_administrator';

export type ZoneTakeover = {
    accountId: string;
    nodeId: string;
};

@Injectable()
export class ZoneTakeoverService {
    constructor(
        private readonly _assignments: NodeAssignmentRepository,
        private readonly _release: TakeoverReleaseService,
        private readonly _journal: JournalService,
        private readonly _tree: TreeReadingService,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async takeZone(
        tx: Tx,
        input: ZoneTakeover,
        actor: JournalActor,
    ): Promise<NodeAssignmentSnapshot> {
        const zone = await lockedNodeOrRefuse(this._tree, tx, input.nodeId);
        const chief = await this._assignments.holdActive(tx, {
            accountId: input.accountId,
            nodeId: zone.complexId,
            role: CHIEF,
        });
        if (chief === null) {
            throw chiefRequired(zone.id);
        }
        const takeover = chief.takeZone({
            id: this._ids.next(),
            zone,
            now: this._clock.now(),
        });
        const stored = await this._assignments.addOrFindActive(tx, takeover);
        if (stored === takeover) {
            await this._zoneTaken(tx, stored.view(), actor);
        }
        return stored.view();
    }

    async returnZone(
        tx: Tx,
        takeoverId: string,
        actor: JournalActor,
    ): Promise<NodeAssignmentSnapshot> {
        const takeover = await this._assignments.lockById(tx, takeoverId);
        if (takeover === null || !takeover.isTakeover()) {
            throw new MembershipError(
                'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                'Zone takeover is not found',
                { assignmentId: takeoverId },
            );
        }
        await this._release.end(tx, takeover, 'returned_by_chief', actor);
        return takeover.view();
    }

    private async _zoneTaken(
        tx: Tx,
        takeover: NodeAssignmentSnapshot,
        actor: JournalActor,
    ): Promise<void> {
        await this._journal.record(tx, ZONE_TAKEN, {
            actor,
            nodeId: takeover.nodeId,
            subjectAccountId: takeover.accountId,
            details: { assignmentId: takeover.id },
        });
        this._events.info('membership.zone_taken', {
            assignmentId: takeover.id,
            accountId: takeover.accountId,
            nodeId: takeover.nodeId,
        });
    }
}
