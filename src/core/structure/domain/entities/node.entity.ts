import { addressOf, nodeNameOf } from '../rules/labels.ts';
import { StructureError } from '../structure.errors.ts';
import {
    assertChildKind,
    assertRootKind,
    type NodeKind,
} from '../rules/node-levels.ts';

export type NodeSnapshot = {
    id: string;
    complexId: string;
    parentId: string | null;
    kind: NodeKind;
    name: string;
    address: string | null;
    createdAt: Date;
};

export type NewNode = {
    id: string;
    kind: NodeKind;
    name: string;
    address: string | null;
    now: Date;
};

export class NodeEntity {
    private constructor(private readonly snapshot: NodeSnapshot) {}

    static root(input: NewNode): NodeEntity {
        assertRootKind(input.kind);
        return new NodeEntity({
            id: input.id,
            complexId: input.id,
            parentId: null,
            kind: input.kind,
            name: nodeNameOf(input.name),
            address: addressOf(input.address),
            createdAt: input.now,
        });
    }

    static restore(snapshot: NodeSnapshot): NodeEntity {
        return new NodeEntity(snapshot);
    }

    child(input: NewNode): NodeEntity {
        assertChildKind(this.snapshot.kind, input.kind);
        return new NodeEntity({
            id: input.id,
            complexId: this.snapshot.complexId,
            parentId: this.snapshot.id,
            kind: input.kind,
            name: nodeNameOf(input.name),
            address: addressOf(input.address),
            createdAt: input.now,
        });
    }

    acceptRetry(retry: NodeEntity): void {
        if (
            this.snapshot.parentId !== retry.snapshot.parentId ||
            this.snapshot.kind !== retry.snapshot.kind
        ) {
            throw new StructureError(
                'STRUCTURE_ID_TAKEN',
                'This id already belongs to another node',
                { id: retry.snapshot.id },
            );
        }
    }

    view(): NodeSnapshot {
        return { ...this.snapshot };
    }
}
