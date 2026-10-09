import type { Prisma } from '../../../generated/prisma/client.ts';

export const NODE_ASSIGNMENT_STATE_SELECT = {
    id: true,
    accountId: true,
    nodeId: true,
    role: true,
    startedAt: true,
    endedAt: true,
} satisfies Prisma.NodeAssignmentSelect;

export type NodeAssignmentStateRow = Prisma.NodeAssignmentGetPayload<{
    select: typeof NODE_ASSIGNMENT_STATE_SELECT;
}>;
