import type { NodeSnapshot } from './node.entity.ts';
import type { UnitSnapshot } from './unit.entity.ts';

export type UnitChain = {
    nodes: NodeSnapshot[];
    unit: UnitSnapshot;
};

export type Subtree = {
    nodes: NodeSnapshot[];
    units: UnitSnapshot[];
};
