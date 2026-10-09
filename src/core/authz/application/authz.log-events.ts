import type { AuthzErrorCode } from '../domain/authz.errors.ts';

declare module '../../../shared/logging/log-events.ts' {
    interface LogEvents {
        'authz.access_refused': {
            accountId: string;
            action: string;
            code: AuthzErrorCode;
        };
    }
}
