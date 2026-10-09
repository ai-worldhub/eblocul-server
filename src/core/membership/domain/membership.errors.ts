export type MembershipErrorCode =
    | 'MEMBERSHIP_NODE_KIND_FORBIDDEN'
    | 'MEMBERSHIP_CHIEF_REQUIRED'
    | 'MEMBERSHIP_UNIT_ROLE_CONFLICT'
    | 'MEMBERSHIP_NODE_NOT_FOUND'
    | 'MEMBERSHIP_UNIT_NOT_FOUND'
    | 'MEMBERSHIP_ACCOUNT_NOT_FOUND'
    | 'MEMBERSHIP_ASSIGNMENT_NOT_FOUND'
    | 'MEMBERSHIP_UNIT_MEMBERSHIP_NOT_FOUND'
    | 'MEMBERSHIP_CHANGED_CONCURRENTLY'
    | 'MEMBERSHIP_SEED_PASSWORD_MISSING'
    | 'MEMBERSHIP_SEED_DATA_MISSING';

export class MembershipError extends Error {
    constructor(
        readonly code: MembershipErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'MembershipError';
    }
}
