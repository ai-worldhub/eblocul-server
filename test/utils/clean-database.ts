import type { DbService } from '../../src/db/db.service.ts';

export const cleanDatabase = async (db: DbService): Promise<void> => {
    if (process.env['NODE_ENV'] !== 'e2e') {
        throw new Error('Refusing to clean the database outside NODE_ENV=e2e');
    }

    const tables = await db.$queryRaw<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;

    if (tables.length === 0) {
        return;
    }

    const list = tables
        .map(({ tablename }) => `"public"."${tablename}"`)
        .join(', ');

    await db.$executeRawUnsafe(
        `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
    );
};
