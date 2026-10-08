import type { Prisma } from '../../../generated/prisma/client.ts';

export const SESSION_STATE_SELECT = {
    id: true,
    accountId: true,
    tokenHash: true,
    application: true,
    transport: true,
    createdAt: true,
    lastActiveAt: true,
    expiresAt: true,
    endedAt: true,
} satisfies Prisma.SessionSelect;

export type SessionStateRow = Prisma.SessionGetPayload<{
    select: typeof SESSION_STATE_SELECT;
}>;
