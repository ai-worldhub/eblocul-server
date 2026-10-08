import type { SessionApplication } from '../domain/entities/session.entity.ts';

declare module '../../../shared/logging/log-events.ts' {
    interface LogEvents {
        'identity.account_created': { accountId: string };
        'identity.signed_in': {
            accountId: string;
            sessionId: string;
            application: SessionApplication;
        };
        'identity.sign_in_failed': {
            accountId: string | null;
            application: SessionApplication;
        };
        'identity.sign_in_locked': {
            accountId: string | null;
            application: SessionApplication;
        };
        'identity.session_renewed': { accountId: string; sessionId: string };
        'identity.signed_out': { accountId: string; sessionId: string };
    }
}
