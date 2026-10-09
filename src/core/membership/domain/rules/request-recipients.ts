import type { NodeAssignmentSnapshot } from '../entities/node-assignment.entity.ts';
import type { AssignmentRole } from './assignment-places.ts';

export type RecipientRole = Extract<
    AssignmentRole,
    'administrator' | 'chief_administrator'
>;

export type RequestRecipients = {
    role: RecipientRole | null;
    accountIds: string[];
};

const ROLES_BY_PRIORITY: readonly RecipientRole[] = [
    'administrator',
    'chief_administrator',
];

export const recipientsAmong = (
    covering: readonly NodeAssignmentSnapshot[],
): RequestRecipients => {
    for (const role of ROLES_BY_PRIORITY) {
        const accountIds = [
            ...new Set(
                covering
                    .filter(
                        (assignment) =>
                            assignment.role === role &&
                            assignment.endedAt === null,
                    )
                    .map((assignment) => assignment.accountId),
            ),
        ];
        if (accountIds.length > 0) {
            return { role, accountIds };
        }
    }
    return { role: null, accountIds: [] };
};
