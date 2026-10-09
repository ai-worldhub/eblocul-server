import type { Prisma } from '../../../generated/prisma/client.ts';

export const NODE_ID_SELECT = {
    id: true,
} satisfies Prisma.NodeSelect;

export const NODE_STATE_SELECT = {
    id: true,
    complexId: true,
    kind: true,
    name: true,
    address: true,
    createdAt: true,
} satisfies Prisma.NodeSelect;

export type NodeStateRow = Prisma.NodeGetPayload<{
    select: typeof NODE_STATE_SELECT;
}>;
