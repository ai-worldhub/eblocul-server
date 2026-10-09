import type { SessionApplication } from '../domain/entities/session.entity.ts';
import type { CodeOutcome } from '../domain/rules/phone-code.ts';

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
        'identity.code_sent': { codeId: string };
        'identity.code_confirmed': { codeId: string; outcome: CodeOutcome };
        'identity.phone_verified': { accountId: string };
        'identity.consent_accepted': { accountId: string };
        'identity.phone_codes_purged': { phoneCodes: number };
        'identity.session_renewed': { accountId: string; sessionId: string };
        'identity.signed_out': { accountId: string; sessionId: string };
    }
}
