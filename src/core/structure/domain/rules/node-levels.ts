import { StructureError } from '../structure.errors.ts';

export type NodeKind = 'quarter' | 'zone' | 'building' | 'line' | 'entrance';

const NODE_LEVELS: Record<NodeKind, number> = {
    quarter: 1,
    zone: 2,
    building: 3,
    line: 3,
    entrance: 4,
};

const ROOT_KINDS: readonly NodeKind[] = ['quarter', 'zone', 'building'];

const REQUIRED_PARENTS: Partial<Record<NodeKind, NodeKind>> = {
    entrance: 'building',
};

export const assertRootKind = (kind: NodeKind): void => {
    if (!ROOT_KINDS.includes(kind)) {
        throw new StructureError(
            'STRUCTURE_ROOT_KIND_FORBIDDEN',
            'A complex starts with a quarter, a zone or a building',
            { kind },
        );
    }
};

export const assertChildKind = (parent: NodeKind, child: NodeKind): void => {
    const requiredParent = REQUIRED_PARENTS[child];
    const isBelow = NODE_LEVELS[child] > NODE_LEVELS[parent];
    const isParentAccepted =
        requiredParent === undefined || requiredParent === parent;
    if (!isBelow || !isParentAccepted) {
        throw new StructureError(
            'STRUCTURE_CHILD_KIND_FORBIDDEN',
            'A node of this kind cannot stand under this parent',
            { parentKind: parent, childKind: child },
        );
    }
};
