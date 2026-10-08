import { unitNumberOf } from '../rules/labels.ts';
import {
    assertUnitFloor,
    assertUnitPlacement,
    type UnitType,
} from '../rules/unit-placement.ts';
import { StructureError } from '../structure.errors.ts';
import type { NodeSnapshot } from './node.entity.ts';

export type UnitSnapshot = {
    id: string;
    complexId: string;
    nodeId: string;
    type: UnitType;
    number: string;
    floor: number | null;
    createdAt: Date;
};

export class UnitEntity {
    private constructor(private readonly snapshot: UnitSnapshot) {}

    static place(input: {
        id: string;
        node: NodeSnapshot;
        type: UnitType;
        number: string;
        floor: number | null;
        now: Date;
    }): UnitEntity {
        assertUnitPlacement(input.node.kind, input.type);
        assertUnitFloor(input.type, input.floor);
        return new UnitEntity({
            id: input.id,
            complexId: input.node.complexId,
            nodeId: input.node.id,
            type: input.type,
            number: unitNumberOf(input.number),
            floor: input.floor,
            createdAt: input.now,
        });
    }

    static restore(snapshot: UnitSnapshot): UnitEntity {
        return new UnitEntity(snapshot);
    }

    acceptRetry(retry: UnitEntity): void {
        if (
            this.snapshot.nodeId !== retry.snapshot.nodeId ||
            this.snapshot.type !== retry.snapshot.type
        ) {
            throw new StructureError(
                'STRUCTURE_ID_TAKEN',
                'This id already belongs to another unit',
                { id: retry.snapshot.id },
            );
        }
    }

    view(): UnitSnapshot {
        return { ...this.snapshot };
    }
}
