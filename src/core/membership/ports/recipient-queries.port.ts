import type { Tx } from '../../../shared/db/tx.ts';
import type { NodeAssignmentSnapshot } from '../domain/entities/node-assignment.entity.ts';

export abstract class RecipientQueries {
    abstract responsibleFor(
        tx: Tx,
        nodeId: string,
    ): Promise<NodeAssignmentSnapshot[] | null>;
}
