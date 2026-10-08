import type { Prisma } from '../../../generated/prisma/client.ts';

export const ATTEMPT_SERIES_STATE_SELECT = {
    id: true,
    key: true,
    failures: true,
    lockEndsAt: true,
    expiresAt: true,
} satisfies Prisma.AttemptSeriesSelect;

export type AttemptSeriesStateRow = Prisma.AttemptSeriesGetPayload<{
    select: typeof ATTEMPT_SERIES_STATE_SELECT;
}>;
