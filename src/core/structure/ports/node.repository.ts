import type { Tx } from '../../../shared/db/tx.ts';
import type { NodeEntity } from '../domain/entities/node.entity.ts';

export abstract class NodeRepository {
    abstract lockById(tx: Tx, nodeId: string): Promise<NodeEntity | null>;
    abstract addOrFind(tx: Tx, node: NodeEntity): Promise<NodeEntity>;
}
