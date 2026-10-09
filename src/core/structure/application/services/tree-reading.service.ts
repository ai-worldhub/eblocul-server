import { Injectable } from '@nestjs/common';
import { DbService } from '../../../../shared/db/db.service.ts';
import type { Subtree, UnitChain } from '../../domain/entities/tree.ts';
import { StructureError } from '../../domain/structure.errors.ts';
import { NODE_ID_SELECT } from '../../infrastructure/node.select.ts';
import { TreeQueries } from '../../ports/tree-queries.port.ts';

@Injectable()
export class TreeReadingService {
    constructor(
        private readonly _queries: TreeQueries,
        private readonly _db: DbService,
    ) {}

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

    async rootExistsByName(name: string): Promise<boolean> {
        const root = await this._db.node.findFirst({
            where: { name, complexId: { equals: this._db.node.fields.id } },
            select: NODE_ID_SELECT,
        });
        return root !== null;
    }
}
