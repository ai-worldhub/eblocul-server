import type { Tx } from '../../../shared/db/tx.ts';
import type {
    NodeSnapshot,
    TreeReadingService,
} from '../../structure/index.ts';
import { MembershipError } from '../domain/membership.errors.ts';

export const nodeOrRefuse = async (
    tree: TreeReadingService,
    tx: Tx,
    nodeId: string,
): Promise<NodeSnapshot> => {
    const node = await tree.findNode(tx, nodeId);
    if (node === null) {
        throw new MembershipError(
            'MEMBERSHIP_NODE_NOT_FOUND',
            'Node is not found',
            { nodeId },
        );
    }
    return node;
};
