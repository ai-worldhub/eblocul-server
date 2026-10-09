import type { Tx } from '../../../shared/db/tx.ts';
import type {
    NodeSnapshot,
    TreeReadingService,
} from '../../structure/index.ts';
import { MembershipError } from '../domain/membership.errors.ts';

const found = (node: NodeSnapshot | null, nodeId: string): NodeSnapshot => {
    if (node === null) {
        throw new MembershipError(
            'MEMBERSHIP_NODE_NOT_FOUND',
            'Node is not found',
            { nodeId },
        );
    }
    return node;
};

export const nodeOrRefuse = async (
    tree: TreeReadingService,
    tx: Tx,
    nodeId: string,
): Promise<NodeSnapshot> => found(await tree.findNode(tx, nodeId), nodeId);

export const lockedNodeOrRefuse = async (
    tree: TreeReadingService,
    tx: Tx,
    nodeId: string,
): Promise<NodeSnapshot> => found(await tree.lockNode(tx, nodeId), nodeId);
