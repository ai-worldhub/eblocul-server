import { StructureError } from '../structure.errors.ts';

export const nodeNameOf = (name: string): string => {
    const trimmed = name.trim();
    if (trimmed === '') {
        throw new StructureError(
            'STRUCTURE_NODE_NAME_BLANK',
            'Node name is blank',
        );
    }
    return trimmed;
};

export const addressOf = (address: string | null): string | null => {
    const trimmed = address?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
};

export const unitNumberOf = (number: string): string => {
    const trimmed = number.trim();
    if (trimmed === '') {
        throw new StructureError(
            'STRUCTURE_UNIT_NUMBER_BLANK',
            'Unit number is blank',
        );
    }
    return trimmed;
};
