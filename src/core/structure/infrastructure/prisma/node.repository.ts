import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    NodeEntity,
    type NodeSnapshot,
} from '../../domain/entities/node.entity.ts';
import type { NodeRepository } from '../../ports/node.repository.ts';
import {
    NODE_ID_SELECT,
    NODE_STATE_SELECT,
    type NodeStateRow,
} from '../node.select.ts';

type NodeState = NodeStateRow & { parentId: string | null };

true satisfies [NodeState] extends [NodeSnapshot]
    ? [NodeSnapshot] extends [NodeState]
        ? true
        : false
    : false;

type Locked = { id: string; parent_id: string | null };

@Injectable()
export class PrismaNodeRepository implements NodeRepository {
    async lockById(tx: Tx, nodeId: string): Promise<NodeEntity | null> {
        const locked = await tx.$queryRaw<Locked[]>`
            SELECT n.id, parent.ancestor_id AS parent_id
            FROM structure.nodes n
            LEFT JOIN structure.node_ancestors parent
                ON parent.node_id = n.id AND parent.depth = 1
            WHERE n.id = ${nodeId}::uuid
            FOR UPDATE OF n
        `;
        const found = locked[0];
        if (found === undefined) {
            return null;
        }
        const row = await tx.node.findUniqueOrThrow({
            where: { id: found.id },
            select: NODE_STATE_SELECT,
        });
        return NodeEntity.restore({ ...row, parentId: found.parent_id });
    }

    async add(tx: Tx, node: NodeEntity): Promise<void> {
        const { parentId, ...row } = node.view();
        await tx.node.create({ data: row, select: NODE_ID_SELECT });
        await tx.$executeRaw`
            INSERT INTO structure.node_ancestors (node_id, ancestor_id, depth)
            SELECT ${row.id}::uuid, ${row.id}::uuid, 0
            UNION ALL
            SELECT ${row.id}::uuid, ancestor_id, depth + 1
            FROM structure.node_ancestors
            WHERE node_id = ${parentId}::uuid
        `;
    }
}
