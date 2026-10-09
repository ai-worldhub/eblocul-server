import { Prisma } from '../../../../generated/prisma/client.ts';
import { MembershipError } from '../../domain/membership.errors.ts';

const FOREIGN_KEY_VIOLATION = 'P2003';

export const refuseMissingAccount = (
    error: unknown,
    accountId: string,
): never => {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_VIOLATION
    ) {
        throw new MembershipError(
            'MEMBERSHIP_ACCOUNT_NOT_FOUND',
            'Account is not found',
            { accountId },
        );
    }
    throw error;
};
