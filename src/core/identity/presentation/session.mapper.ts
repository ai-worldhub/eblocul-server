import type { SessionContext } from '../domain/session.entity.ts';
import type { Session } from './dto/session.dto.ts';

export const toCurrentSession = (session: SessionContext): Session.Current => ({
    accountId: session.accountId,
    application: session.application,
});
