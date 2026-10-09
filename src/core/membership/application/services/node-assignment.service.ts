import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
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
        private readonly _tree: TreeReadingService,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
        private readonly _events: EventLogger,
    ) {}

    async assign(
        tx: Tx,
        input: NewAssignment,
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
        if (isZoneHolder && returnsTakenZone(holdersBefore)) {
            await this._takeovers.endOnZone(tx, node.id);
        }
        this._events.info('membership.assigned', {
            assignmentId: assignment.view().id,
            accountId: input.accountId,
            nodeId: node.id,
            role: input.role,
        });
        return assignment.view();
    }

    async end(tx: Tx, assignmentId: string): Promise<NodeAssignmentSnapshot> {
        const assignment = await this._assignments.lockById(tx, assignmentId);
        if (assignment === null || assignment.isTakeover()) {
            throw new MembershipError(
                'MEMBERSHIP_ASSIGNMENT_NOT_FOUND',
                'Assignment is not found',
                { assignmentId },
            );
        }
        if (!assignment.end(this._clock.now())) {
            return assignment.view();
        }
        await this._assignments.save(tx, assignment);
        const ended = assignment.view();
        if (assignment.holdsTakeovers()) {
            await this._takeovers.endOfChief(tx, ended.accountId, ended.nodeId);
        }
        this._events.info('membership.assignment_ended', {
            assignmentId: ended.id,
            accountId: ended.accountId,
            nodeId: ended.nodeId,
            role: ended.role,
        });
        return ended;
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
