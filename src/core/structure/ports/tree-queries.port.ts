import type { Subtree, UnitChain } from '../domain/entities/tree.ts';

export abstract class TreeQueries {
    abstract chainOfUnit(unitId: string): Promise<UnitChain | null>;
    abstract subtreeOf(nodeId: string): Promise<Subtree | null>;
}
