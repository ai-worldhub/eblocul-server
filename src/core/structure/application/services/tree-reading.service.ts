import { Injectable } from '@nestjs/common';
import { DbService } from '../../../../shared/db/db.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import type { NodeSnapshot } from '../../domain/entities/node.entity.ts';
import type { Subtree, UnitChain } from '../../domain/entities/tree.ts';
import type { UnitSnapshot } from '../../domain/entities/unit.entity.ts';
import { StructureError } from '../../domain/structure.errors.ts';
import { NODE_ID_SELECT } from '../../infrastructure/node.select.ts';
import { NodeRepository } from '../../ports/node.repository.ts';
import { TreeQueries } from '../../ports/tree-queries.port.ts';
import { UnitRepository } from '../../ports/unit.repository.ts';

@Injectable()
export class TreeReadingService {
    constructor(
        private readonly _queries: TreeQueries,
        private readonly _nodes: NodeRepository,
        private readonly _units: UnitRepository,
        private readonly _db: DbService,
    ) {}

    async findNode(tx: Tx, nodeId: string): Promise<NodeSnapshot | null> {
        const node = await this._nodes.findById(tx, nodeId);
        return node?.view() ?? null;
    }

    async findUnit(tx: Tx, unitId: string): Promise<UnitSnapshot | null> {
        const unit = await this._units.findById(tx, unitId);
        return unit?.view() ?? null;
    }

    async chainOfUnit(unitId: string): Promise<UnitChain> {
        const chain = await this._queries.chainOfUnit(unitId);
        if (chain === null) {
            throw new StructureError(
                'STRUCTURE_UNIT_NOT_FOUND',
                'Unit is not found',
                { unitId },
            );
        }
        return chain;
    }

    async subtreeOf(nodeId: string): Promise<Subtree> {
        const subtree = await this._queries.subtreeOf(nodeId);
        if (subtree === null) {
            throw new StructureError(
                'STRUCTURE_NODE_NOT_FOUND',
                'Node is not found',
                { nodeId },
            );
        }
        return subtree;
    }

    async rootIdByName(name: string): Promise<string | null> {
        const root = await this._db.node.findFirst({
            where: { name, complexId: { equals: this._db.node.fields.id } },
            select: NODE_ID_SELECT,
        });
        return root?.id ?? null;
    }

    async rootExistsByName(name: string): Promise<boolean> {
        return (await this.rootIdByName(name)) !== null;
    }
}
