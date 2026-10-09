import type { DbService } from '../../src/shared/db/db.service.ts';

export type RecordedEntry = {
    action: string;
    complexId: string;
    ownerNodeId: string;
    actorKind: string;
    actorAccountId: string | null;
    actorRole: string | null;
    subjectAccountId: string | null;
    subjectUnitId: string | null;
    details: unknown;
    createdAt: Date;
};

export const recordedEntries = async (
    db: DbService,
): Promise<RecordedEntry[]> => {
    const rows = await db.journalEntry.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
        action: row.action,
        complexId: row.complexId,
        ownerNodeId: row.ownerNodeId,
        actorKind: row.actorKind,
        actorAccountId: row.actorAccountId,
        actorRole: row.actorRole,
        subjectAccountId: row.subjectAccountId,
        subjectUnitId: row.subjectUnitId,
        details: row.details,
        createdAt: row.createdAt,
    }));
};
