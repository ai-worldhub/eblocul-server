import type { Prisma } from '../../../generated/prisma/client.ts';

export const UNIT_MEMBERSHIP_STATE_SELECT = {
    id: true,
    accountId: true,
    unitId: true,
    role: true,
    startedAt: true,
    endedAt: true,
} satisfies Prisma.UnitMembershipSelect;

export type UnitMembershipStateRow = Prisma.UnitMembershipGetPayload<{
    select: typeof UNIT_MEMBERSHIP_STATE_SELECT;
}>;
