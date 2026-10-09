import type { Prisma } from '../../../generated/prisma/client.ts';

export const ACCOUNT_ID_SELECT = {
    id: true,
} satisfies Prisma.AccountSelect;

export const ACCOUNT_NAME_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
} satisfies Prisma.AccountSelect;

export type AccountName = Prisma.AccountGetPayload<{
    select: typeof ACCOUNT_NAME_SELECT;
}>;

export const ACCOUNT_SIGN_IN_SELECT = {
    id: true,
    password: { select: { hash: true } },
} satisfies Prisma.AccountSelect;

export const ACCOUNT_PHONE_SIGN_IN_SELECT = {
    id: true,
    phoneVerifiedAt: true,
    consents: { select: { id: true }, take: 1 },
} satisfies Prisma.AccountSelect;

export type AccountPhoneSignIn = Prisma.AccountGetPayload<{
    select: typeof ACCOUNT_PHONE_SIGN_IN_SELECT;
}>;
