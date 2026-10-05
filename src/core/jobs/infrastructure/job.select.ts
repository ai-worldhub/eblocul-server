import type { Prisma } from '../../../generated/prisma/client.ts';

export const JOB_STATE_SELECT = {
    id: true,
    kind: true,
    class: true,
    state: true,
    payload: true,
    dedupKey: true,
    attempts: true,
    leaseId: true,
    createdAt: true,
    availableAt: true,
    leaseExpiresAt: true,
} satisfies Prisma.JobSelect;

export type JobStateRow = Prisma.JobGetPayload<{
    select: typeof JOB_STATE_SELECT;
}>;
