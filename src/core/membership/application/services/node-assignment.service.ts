import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import { type JournalActor, JournalService } from '../../../journal/index.ts';
import { TreeReadingService } from '../../../structure/index.ts';
import {
    NodeAssignmentEntity,
    type NodeAssignmentSnapshot,
} from '../../domain/entities/node-assignment.entity.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import {
    type AppointedRole,
    holdsZone,
    returnsTakenZone,
} from '../../domain/rules/assignment-places.ts';
import { NodeAssignmentRepository } from '../../ports/node-assignment.repository.ts';
import { ROLE_ASSIGNED, ROLE_ENDED } from '../membership.journal-actions.ts';
import '../membership.log-events.ts';
import { lockedNodeOrRefuse, nodeOrRefuse } from '../node-lookup.ts';
import { TakeoverReleaseService } from './takeover-release.service.ts';

export type NewAssignment = {
    accountId: string;
    nodeId: string;
    role: AppointedRole;
};

@Injectable()
export class NodeAssignmentService {
    constructor(
        private readonly _assignments: NodeAssignmentRepository,
        private readonly _takeovers: TakeoverReleaseService,
        private readonly _journal: JournalService,
        private readonly _tree: TreeReadingService,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async assign(
        tx: Tx,
        input: NewAssignment,
        actor: JournalActor,
    ): Promise<NodeAssignmentSnapshot> {
        const node = await nodeOrRefuse(this._tree, tx, input.nodeId);
        const assignment = NodeAssignmentEntity.appoint({
            id: this._ids.next(),
            accountId: input.accountId,
            node,
            role: input.role,
            now: this._clock.now(),
        });
        const isZoneHolder = holdsZone(input.role, node);
        const holdersBefore = isZoneHolder
            ? await this._holdersOfLockedZone(tx, node.id, input.role)
            : 0;
        const stored = await this._assignments.addOrFindActive(tx, assignment);
        if (stored !== assignment) {
            return stored.view();
        }
        await this._journal.record(tx, ROLE_ASSIGNED, {
            actor,
            nodeId: node.id,
            subjectAccountId: input.accountId,
            details: { assignmentId: assignment.view().id, role: input.role },
        });
        if (isZoneHolder && returnsTakenZone(holdersBefore)) {
            await this._takeovers.endOnZone(tx, node.id, actor);
        }
        this._events.info('membership.assigned', {
            assignmentId: assignment.view().id,
            accountId: input.accountId,
            nodeId: node.id,
            role: input.role,
        });
        return assignment.view();
    }

    async end(
        tx: Tx,
        assignmentId: string,
        actor: JournalActor,
    ): Promise<NodeAssignmentSnapshot> {
        const assignment = await this._assignments.lockById(tx, assignmentId);
        const role = assignment?.appointedRole() ?? null;
        if (assignment === null || role === null) {
            throw new MembershipError(
                'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                'Assignment is not found',
                { assignmentId },
            );
        }
        await this._lockHeldZone(tx, assignment.view());
        if (!assignment.end(this._clock.now())) {
            return assignment.view();
        }
        await this._assignments.save(tx, assignment);
        const ended = assignment.view();
        await this._journal.record(tx, ROLE_ENDED, {
            actor,
            nodeId: ended.nodeId,
            subjectAccountId: ended.accountId,
            details: { assignmentId: ended.id, role },
        });
        if (assignment.holdsTakeovers()) {
            await this._takeovers.endOfChief(
                tx,
                ended.accountId,
                ended.nodeId,
                actor,
            );
        }
        this._events.info('membership.assignment_ended', {
            assignmentId: ended.id,
            accountId: ended.accountId,
            nodeId: ended.nodeId,
            role: ended.role,
        });
        return ended;
    }

    private async _lockHeldZone(
        tx: Tx,
        held: NodeAssignmentSnapshot,
    ): Promise<void> {
        const node = await nodeOrRefuse(this._tree, tx, held.nodeId);
        if (holdsZone(held.role, node)) {
            await lockedNodeOrRefuse(this._tree, tx, node.id);
        }
    }

    private async _holdersOfLockedZone(
        tx: Tx,
        zoneId: string,
        role: AppointedRole,
    ): Promise<number> {
        await lockedNodeOrRefuse(this._tree, tx, zoneId);
        const holders = await this._assignments.findActiveOnNode(
            tx,
            zoneId,
            role,
        );
        return holders.length;
    }
}
