import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    NodeAssignmentEntity,
    type NodeAssignmentSnapshot,
} from '../../domain/entities/node-assignment.entity.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import type {
    ActiveAssignmentKey,
    NodeAssignmentRepository,
} from '../../ports/node-assignment.repository.ts';
import {
    NODE_ASSIGNMENT_STATE_SELECT,
    type NodeAssignmentStateRow,
} from '../node-assignment.select.ts';
import { refuseMissingAccount } from './missing-account.ts';

true satisfies [NodeAssignmentStateRow] extends [NodeAssignmentSnapshot]
    ? [NodeAssignmentSnapshot] extends [NodeAssignmentStateRow]
        ? true
        : false
    : false;

type Found = { id: string };

@Injectable()
export class PrismaNodeAssignmentRepository implements NodeAssignmentRepository {
    async addOrFindActive(
        tx: Tx,
        assignment: NodeAssignmentEntity,
    ): Promise<NodeAssignmentEntity> {
        const row = assignment.view();
        const { count } = await tx.nodeAssignment
            .createMany({ data: [row], skipDuplicates: true })
            .catch((error: unknown) =>
                refuseMissingAccount(error, row.accountId),
            );
        if (count === 1) {
            return assignment;
        }
        const active = await tx.nodeAssignment.findFirst({
            where: {
                accountId: row.accountId,
                nodeId: row.nodeId,
                role: row.role,
                endedAt: null,
            },
            select: NODE_ASSIGNMENT_STATE_SELECT,
        });
        if (active === null) {
            throw new MembershipError(
                'MEMBERSHIP_CHANGED_CONCURRENTLY',
                'The assignment changed during the request: repeat it',
            );
        }
        return NodeAssignmentEntity.restore(active);
    }

    async lockById(
        tx: Tx,
        assignmentId: string,
    ): Promise<NodeAssignmentEntity | null> {
        const [assignment = null] = await this._lock(
            tx,
            Prisma.sql`
                SELECT s.id
                FROM membership.node_assignments s
                WHERE s.id = ${assignmentId}::uuid
                FOR UPDATE OF s
            `,
        );
        return assignment;
    }

    async lockActive(
        tx: Tx,
        key: ActiveAssignmentKey,
    ): Promise<NodeAssignmentEntity | null> {
        const [assignment = null] = await this._lock(
            tx,
            Prisma.sql`
                SELECT s.id
                FROM membership.node_assignments s
                WHERE s.account_id = ${key.accountId}::uuid
                  AND s.node_id = ${key.nodeId}::uuid
                  AND s.role = ${key.role}::membership.assignment_role
                  AND s.ended_at IS NULL
                FOR UPDATE OF s
            `,
        );
        return assignment;
    }

    lockActiveTakeoversOfNode(
        tx: Tx,
        nodeId: string,
    ): Promise<NodeAssignmentEntity[]> {
        return this._lock(
            tx,
            Prisma.sql`
                SELECT s.id
                FROM membership.node_assignments s
                WHERE s.node_id = ${nodeId}::uuid
                  AND s.role = 'zone_takeover'
                  AND s.ended_at IS NULL
                FOR UPDATE OF s
            `,
        );
    }

    lockActiveTakeoversOfAccount(
        tx: Tx,
        accountId: string,
        quarterId: string,
    ): Promise<NodeAssignmentEntity[]> {
        return this._lock(
            tx,
            Prisma.sql`
                SELECT s.id
                FROM membership.node_assignments s
                JOIN structure.node_ancestors a
                    ON a.node_id = s.node_id
                   AND a.ancestor_id = ${quarterId}::uuid
                WHERE s.account_id = ${accountId}::uuid
                  AND s.role = 'zone_takeover'
                  AND s.ended_at IS NULL
                FOR UPDATE OF s
            `,
        );
    }

    async save(tx: Tx, assignment: NodeAssignmentEntity): Promise<void> {
        const { id, endedAt } = assignment.view();
        await tx.nodeAssignment.updateMany({
            where: { id },
            data: { endedAt },
        });
    }

    private async _lock(
        tx: Tx,
        query: Prisma.Sql,
    ): Promise<NodeAssignmentEntity[]> {
        const found = await tx.$queryRaw<Found[]>(query);
        if (found.length === 0) {
            return [];
        }
        const rows = await tx.nodeAssignment.findMany({
            where: { id: { in: found.map(({ id }) => id) } },
            select: NODE_ASSIGNMENT_STATE_SELECT,
            orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map((row) => NodeAssignmentEntity.restore(row));
    }
}
