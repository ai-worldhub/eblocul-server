import type { AccessContext, AccessRole } from '../../authz/index.ts';
import type {
    ActorRole,
    JournalActor,
} from '../domain/entities/journal-entry.ts';

true satisfies [ActorRole] extends [AccessRole]
    ? [AccessRole] extends [ActorRole]
        ? true
        : false
    : false;

export const actorOf = (access: AccessContext): JournalActor => ({
    kind: 'account',
    accountId: access.accountId,
    role: access.role,
});
