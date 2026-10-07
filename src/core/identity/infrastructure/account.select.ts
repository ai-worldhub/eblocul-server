import type { Prisma } from '../../../generated/prisma/client.ts';

export const ACCOUNT_ID_SELECT = {
    id: true,
} satisfies Prisma.AccountSelect;

export const ACCOUNT_SIGN_IN_SELECT = {
    id: true,
    password: { select: { hash: true } },
} satisfies Prisma.AccountSelect;
