import type { Prisma } from '../../src/generated/prisma/client.ts';
import { defineFactory } from './define-factory.ts';

const CREATED_AT = new Date('2026-10-01T09:00:00.000Z');
const ID_PREFIX = '00000000-0000-7000-9000-';
const ID_TAIL_LENGTH = 12;
const NO_NODE = '00000000-0000-7000-9000-ffffffffffff';

export const unitRow = defineFactory<Prisma.UnitCreateManyInput>(
    (sequence) => ({
        id: `${ID_PREFIX}${String(sequence).padStart(ID_TAIL_LENGTH, '0')}`,
        complexId: NO_NODE,
        nodeId: NO_NODE,
        type: 'apartment',
        number: String(sequence),
        floor: null,
        createdAt: CREATED_AT,
    }),
);
