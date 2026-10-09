import type { DbService } from '../../src/shared/db/db.service.ts';

const JOURNAL = 'journal.entries';
const JOURNAL_GUARD = 'entries_append_only';

export const cleanDatabase = async (db: DbService): Promise<void> => {
    if (process.env['NODE_ENV'] !== 'e2e') {
        throw new Error('Refusing to clean the database outside NODE_ENV=e2e');
    }

    const tables = await db.$queryRaw<
        { schemaname: string; tablename: string }[]
    >`
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
          AND tablename <> '_prisma_migrations'
    `;

    if (tables.length === 0) {
        return;
    }

    const list = tables
        .map(({ schemaname, tablename }) => `"${schemaname}"."${tablename}"`)
        .join(', ');

    await db.$executeRawUnsafe(`
        DO $clean$
        BEGIN
            ALTER TABLE ${JOURNAL} DISABLE TRIGGER ${JOURNAL_GUARD};
            TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;
            ALTER TABLE ${JOURNAL} ENABLE TRIGGER ${JOURNAL_GUARD};
        END
        $clean$
    `);
};
