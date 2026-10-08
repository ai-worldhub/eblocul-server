import type { Prisma } from '../../../generated/prisma/client.ts';

export const UNIT_ID_SELECT = {
    id: true,
} satisfies Prisma.UnitSelect;

const UNIT_STATE_SELECT = {
    id: true,
    complexId: true,
    nodeId: true,
    type: true,
    number: true,
    floor: true,
    createdAt: true,
} satisfies Prisma.UnitSelect;

export type UnitStateRow = Prisma.UnitGetPayload<{
    select: typeof UNIT_STATE_SELECT;
}>;
