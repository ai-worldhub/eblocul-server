import type { Tx } from '../../../shared/db/tx.ts';
import type { NodeAssignmentEntity } from '../domain/entities/node-assignment.entity.ts';
import type { AssignmentRole } from '../domain/rules/assignment-places.ts';

export type ActiveAssignmentKey = {
    accountId: string;
    nodeId: string;
    role: AssignmentRole;
};

export abstract class NodeAssignmentRepository {
    abstract addOrFindActive(
        tx: Tx,
        assignment: NodeAssignmentEntity,
    ): Promise<NodeAssignmentEntity>;
    abstract lockById(
        tx: Tx,
        assignmentId: string,
    ): Promise<NodeAssignmentEntity | null>;
    abstract lockActive(
        tx: Tx,
        key: ActiveAssignmentKey,
    ): Promise<NodeAssignmentEntity | null>;
    abstract lockActiveTakeoversOfNode(
        tx: Tx,
        nodeId: string,
    ): Promise<NodeAssignmentEntity[]>;
    abstract lockActiveTakeoversOfAccount(
        tx: Tx,
        accountId: string,
        quarterId: string,
    ): Promise<NodeAssignmentEntity[]>;
    abstract save(tx: Tx, assignment: NodeAssignmentEntity): Promise<void>;
}
