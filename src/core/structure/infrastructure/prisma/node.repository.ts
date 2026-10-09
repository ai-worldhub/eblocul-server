import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    NodeEntity,
    type NodeSnapshot,
} from '../../domain/entities/node.entity.ts';
import { StructureError } from '../../domain/structure.errors.ts';
import type { NodeRepository } from '../../ports/node.repository.ts';
import { NODE_STATE_SELECT, type NodeStateRow } from '../node.select.ts';

type NodeState = NodeStateRow & { parentId: string | null };

true satisfies [NodeState] extends [NodeSnapshot]
    ? [NodeSnapshot] extends [NodeState]
        ? true
        : false
    : false;

type Found = { id: string; parent_id: string | null };

const ROW_LOCK = Prisma.sql`FOR NO KEY UPDATE OF n`;

@Injectable()
export class PrismaNodeRepository implements NodeRepository {
    findById(tx: Tx, nodeId: string): Promise<NodeEntity | null> {
        return this._load(tx, nodeId, Prisma.empty);
    }

    lockById(tx: Tx, nodeId: string): Promise<NodeEntity | null> {
        return this._load(tx, nodeId, ROW_LOCK);
    }

    async addOrFind(tx: Tx, node: NodeEntity): Promise<NodeEntity> {
        const { parentId, ...row } = node.view();
        const { count } = await tx.node.createMany({
            data: [row],
            skipDuplicates: true,
        });
        if (count === 0) {
            return this._existing(tx, row.id);
        }
        await tx.$executeRaw`
            INSERT INTO structure.node_ancestors (node_id, ancestor_id, depth)
            SELECT ${row.id}::uuid, ${row.id}::uuid, 0
            UNION ALL
            SELECT ${row.id}::uuid, ancestor_id, depth + 1
            FROM structure.node_ancestors
            WHERE node_id = ${parentId}::uuid
        `;
        return node;
    }

    private async _existing(tx: Tx, nodeId: string): Promise<NodeEntity> {
        const existing = await this._load(tx, nodeId, Prisma.empty);
        if (existing === null) {
            throw new StructureError(
                'STRUCTURE_ID_TAKEN',
                'This id already belongs to another node',
                { id: nodeId },
            );
        }
        return existing;
    }

    private async _load(
        tx: Tx,
        nodeId: string,
        lock: Prisma.Sql,
    ): Promise<NodeEntity | null> {
        const rows = await tx.$queryRaw<Found[]>`
            SELECT n.id, parent.ancestor_id AS parent_id
            FROM structure.nodes n
            LEFT JOIN structure.node_ancestors parent
                ON parent.node_id = n.id AND parent.depth = 1
            WHERE n.id = ${nodeId}::uuid
            ${lock}
        `;
        const found = rows[0];
        if (found === undefined) {
            return null;
        }
        const row = await tx.node.findUniqueOrThrow({
            where: { id: found.id },
            select: NODE_STATE_SELECT,
        });
        return NodeEntity.restore({ ...row, parentId: found.parent_id });
    }
}
