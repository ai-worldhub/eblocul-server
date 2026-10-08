import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    NodeEntity,
    type NodeSnapshot,
} from '../../domain/entities/node.entity.ts';
import {
    UnitEntity,
    type UnitSnapshot,
} from '../../domain/entities/unit.entity.ts';
import type { NodeKind } from '../../domain/rules/node-levels.ts';
import type { UnitType } from '../../domain/rules/unit-placement.ts';
import { StructureError } from '../../domain/structure.errors.ts';
import { NodeRepository } from '../../ports/node.repository.ts';
import { UnitRepository } from '../../ports/unit.repository.ts';

export type NewRoot = {
    id: string;
    kind: NodeKind;
    name: string;
    address: string | null;
};

export type NewChild = NewRoot & { parentId: string };

export type NewUnit = {
    id: string;
    nodeId: string;
    type: UnitType;
    number: string;
    floor: number | null;
};

@Injectable()
export class TreeBuildingService {
    constructor(
        private readonly _nodes: NodeRepository,
        private readonly _units: UnitRepository,
        private readonly _clock: Clock,
    ) {}

    async createRoot(tx: Tx, input: NewRoot): Promise<NodeSnapshot> {
        const root = NodeEntity.root({ ...input, now: this._clock.now() });
        await this._nodes.add(tx, root);
        return root.view();
    }

    async createChild(tx: Tx, input: NewChild): Promise<NodeSnapshot> {
        const { parentId, ...node } = input;
        const parent = await this._lockNode(tx, parentId);
        const child = parent.child({ ...node, now: this._clock.now() });
        await this._nodes.add(tx, child);
        return child.view();
    }

    async createUnit(tx: Tx, input: NewUnit): Promise<UnitSnapshot> {
        const node = await this._lockNode(tx, input.nodeId);
        const unit = UnitEntity.place({
            id: input.id,
            node: node.view(),
            type: input.type,
            number: input.number,
            floor: input.floor,
            now: this._clock.now(),
        });
        await this._units.add(tx, unit);
        return unit.view();
    }

    private async _lockNode(tx: Tx, nodeId: string): Promise<NodeEntity> {
        const node = await this._nodes.lockById(tx, nodeId);
        if (node === null) {
            throw new StructureError(
                'STRUCTURE_NODE_NOT_FOUND',
                'Node is not found',
                { nodeId },
            );
        }
        return node;
    }
}
