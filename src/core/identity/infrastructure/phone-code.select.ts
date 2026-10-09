import type { Prisma } from '../../../generated/prisma/client.ts';

export const PHONE_CODE_STATE_SELECT = {
    id: true,
    phone: true,
    codeHash: true,
    pendingTokenHash: true,
    createdAt: true,
    expiresAt: true,
    confirmedAt: true,
} satisfies Prisma.PhoneCodeSelect;

export type PhoneCodeStateRow = Prisma.PhoneCodeGetPayload<{
    select: typeof PHONE_CODE_STATE_SELECT;
}>;
