export type AuthzErrorCode =
    | 'AUTHZ_GRANT_REQUIRED'
    | 'AUTHZ_GRANT_NOT_ACTIVE'
    | 'AUTHZ_ACTION_FORBIDDEN'
    | 'AUTHZ_TARGET_NOT_FOUND'
    | 'AUTHZ_ACTION_INVALID'
    | 'AUTHZ_ACCESS_MARK_INVALID';

export class AuthzError extends Error {
    constructor(
        readonly code: AuthzErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'AuthzError';
    }
}

export const grantRequired = (): AuthzError =>
    new AuthzError(
        'AUTHZ_GRANT_REQUIRED',
        'Name the grant to act by in the X-Access-Grant header',
    );

export const grantNotActive = (): AuthzError =>
    new AuthzError('AUTHZ_GRANT_NOT_ACTIVE', 'The grant is not active');

export const actionForbidden = (action: string): AuthzError =>
    new AuthzError(
        'AUTHZ_ACTION_FORBIDDEN',
        'The grant does not allow this action here',
        { action },
    );

export const targetNotFound = (): AuthzError =>
    new AuthzError('AUTHZ_TARGET_NOT_FOUND', 'Not found');
