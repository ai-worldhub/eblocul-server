import { MembershipError } from '../membership.errors.ts';
import {
    type AppointedRole,
    type AssignedNode,
    type AssignmentRole,
    assertRolePlace,
    isAppointedRole,
} from '../rules/assignment-places.ts';

export type NodeAssignmentSnapshot = {
    id: string;
    accountId: string;
    nodeId: string;
    role: AssignmentRole;
    startedAt: Date;
    endedAt: Date | null;
};

const CHIEF: AssignmentRole = 'chief_administrator';
const TAKEOVER: AssignmentRole = 'zone_takeover';

export const chiefRequired = (zoneId: string): MembershipError =>
    new MembershipError(
        'MEMBERSHIP_CHIEF_REQUIRED',
        'Only an active chief administrator of the quarter takes its zone',
        { nodeId: zoneId },
    );

export class NodeAssignmentEntity {
    private constructor(private snapshot: NodeAssignmentSnapshot) {}

    static appoint(input: {
        id: string;
        accountId: string;
        node: AssignedNode;
        role: AppointedRole;
        now: Date;
    }): NodeAssignmentEntity {
        assertRolePlace(input.role, input.node);
        return new NodeAssignmentEntity({
            id: input.id,
            accountId: input.accountId,
            nodeId: input.node.id,
            role: input.role,
            startedAt: input.now,
            endedAt: null,
        });
    }

    static restore(snapshot: NodeAssignmentSnapshot): NodeAssignmentEntity {
        return new NodeAssignmentEntity(snapshot);
    }

    takeZone(input: {
        id: string;
        zone: AssignedNode;
        now: Date;
    }): NodeAssignmentEntity {
        if (
            this.snapshot.role !== CHIEF ||
            !this.isActive() ||
            this.snapshot.nodeId !== input.zone.complexId
        ) {
            throw chiefRequired(input.zone.id);
        }
        assertRolePlace(TAKEOVER, input.zone);
        return new NodeAssignmentEntity({
            id: input.id,
            accountId: this.snapshot.accountId,
            nodeId: input.zone.id,
            role: TAKEOVER,
            startedAt: input.now,
            endedAt: null,
        });
    }

    end(now: Date): boolean {
        if (!this.isActive()) {
            return false;
        }
        this.snapshot = { ...this.snapshot, endedAt: now };
        return true;
    }

    isActive(): boolean {
        return this.snapshot.endedAt === null;
    }

    isTakeover(): boolean {
        return this.snapshot.role === TAKEOVER;
    }

    appointedRole(): AppointedRole | null {
        return isAppointedRole(this.snapshot.role) ? this.snapshot.role : null;
    }

    holdsTakeovers(): boolean {
        return this.snapshot.role === CHIEF;
    }

    view(): NodeAssignmentSnapshot {
        return { ...this.snapshot };
    }
}
