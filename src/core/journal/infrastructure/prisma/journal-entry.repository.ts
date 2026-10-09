import { Injectable } from '@nestjs/common';
import type {
    JournalActorKind,
    JournalActorRole,
} from '../../../../generated/prisma/enums.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import type {
    ActorKind,
    ActorRole,
    JournalEntry,
} from '../../domain/entities/journal-entry.ts';
import type { JournalEntryRepository } from '../../ports/journal-entry.repository.ts';

type Same<Ours, Theirs> = [Ours] extends [Theirs]
    ? [Theirs] extends [Ours]
        ? true
        : false
    : false;

true satisfies Same<ActorKind, JournalActorKind>;
true satisfies Same<ActorRole, JournalActorRole>;

@Injectable()
export class PrismaJournalEntryRepository implements JournalEntryRepository {
    async append(tx: Tx, entry: JournalEntry): Promise<boolean> {
        const appended = await tx.$executeRaw`
            INSERT INTO journal.entries (
                id,
                complex_id,
                owner_node_id,
                actor_account_id,
                subject_account_id,
                subject_unit_id,
                action,
                actor_kind,
                actor_role,
                details,
                created_at
            )
            SELECT
                ${entry.id}::uuid,
                n.complex_id,
                n.id,
                ${entry.actorAccountId}::uuid,
                ${entry.subjectAccountId}::uuid,
                ${entry.subjectUnitId}::uuid,
                ${entry.action},
                ${entry.actorKind}::journal.actor_kind,
                ${entry.actorRole}::journal.actor_role,
                ${JSON.stringify(entry.details)}::jsonb,
                ${entry.createdAt}::timestamptz
            FROM structure.nodes n
            WHERE n.id = ${entry.nodeId}::uuid
        `;
        return appended === 1;
    }
}
