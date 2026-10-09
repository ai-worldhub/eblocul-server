import { StructureError } from '../structure.errors.ts';
import type { NodeKind } from './node-levels.ts';

export type UnitType = 'apartment' | 'townhouse' | 'house' | 'duplex';

const UNIT_NODE_KINDS: Record<UnitType, readonly NodeKind[]> = {
    apartment: ['building', 'entrance'],
    townhouse: ['line'],
    house: ['line'],
    duplex: ['line'],
};

const FLOORED_TYPE: UnitType = 'apartment';

export const assertUnitPlacement = (
    nodeKind: NodeKind,
    type: UnitType,
): void => {
    if (!UNIT_NODE_KINDS[type].includes(nodeKind)) {
        throw new StructureError(
            'STRUCTURE_UNIT_PLACEMENT_FORBIDDEN',
            'A unit of this type cannot belong to a node of this kind',
            { nodeKind, type },
        );
    }
};

export const assertUnitFloor = (type: UnitType, floor: number | null): void => {
    if (floor === null) {
        return;
    }
    if (type !== FLOORED_TYPE) {
        throw new StructureError(
            'STRUCTURE_UNIT_FLOOR_FORBIDDEN',
            'Only an apartment has a floor',
            { type },
        );
    }
    if (!Number.isInteger(floor)) {
        throw new StructureError(
            'STRUCTURE_UNIT_FLOOR_INVALID',
            'Floor is a whole number',
        );
    }
};
