import type { CodeConfirmation } from '../../application/services/resident-sign-in.service.ts';
import type { StartedSession } from '../../application/services/session.service.ts';
import type { ResidentSignIn } from '../dto/resident-sign-in.dto.ts';

const toStartedSession = (
    started: StartedSession,
): ResidentSignIn.StartedSession => ({
    token: started.token,
    accountId: started.session.accountId,
    application: started.session.application,
});

export const toSessionResponse = (
    started: StartedSession,
): ResidentSignIn.SessionResponse => ({
    session: toStartedSession(started),
});

export const toLoginResponse = (
    confirmation: CodeConfirmation,
): ResidentSignIn.LoginResponse =>
    confirmation.outcome === 'signed_in'
        ? {
              outcome: confirmation.outcome,
              session: toStartedSession(confirmation.session),
              pending: null,
          }
        : {
              outcome: confirmation.outcome,
              session: null,
              pending: {
                  token: confirmation.pending.token,
                  expiresInSeconds: confirmation.pending.expiresInSeconds,
                  consentVersion: confirmation.pending.consentVersion,
              },
          };
