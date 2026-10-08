export type StructureErrorCode =
    | 'STRUCTURE_ROOT_KIND_FORBIDDEN'
    | 'STRUCTURE_CHILD_KIND_FORBIDDEN'
    | 'STRUCTURE_UNIT_PLACEMENT_FORBIDDEN'
    | 'STRUCTURE_UNIT_FLOOR_FORBIDDEN'
    | 'STRUCTURE_UNIT_FLOOR_INVALID'
    | 'STRUCTURE_UNIT_NUMBER_BLANK'
    | 'STRUCTURE_UNIT_NUMBER_TAKEN'
    | 'STRUCTURE_NODE_NAME_BLANK'
    | 'STRUCTURE_NODE_NOT_FOUND'
    | 'STRUCTURE_UNIT_NOT_FOUND';

export class StructureError extends Error {
    constructor(
        readonly code: StructureErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'StructureError';
    }
}
