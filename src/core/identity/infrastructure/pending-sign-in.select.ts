import type { Prisma } from '../../../generated/prisma/client.ts';

export const PENDING_SIGN_IN_STATE_SELECT = {
    id: true,
    phone: true,
    tokenHash: true,
    language: true,
    confirmedAt: true,
    expiresAt: true,
} satisfies Prisma.PendingSignInSelect;

export type PendingSignInStateRow = Prisma.PendingSignInGetPayload<{
    select: typeof PENDING_SIGN_IN_STATE_SELECT;
}>;
