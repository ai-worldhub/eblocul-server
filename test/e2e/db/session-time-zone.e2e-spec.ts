import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '../../../src/generated/prisma/client.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { assertUtcSession } from '../../../src/shared/db/utc-session.ts';
import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { accountRow } from '../../factories/identity.factory.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';

const SERVER_TIME_ZONE = 'Europe/Chisinau';
const WALL_TIME_MISSING_IN_CHISINAU = new Date('2026-03-29T02:30:00.000Z');
const NEXT_HOUR = new Date('2026-03-29T03:30:00.000Z');
const ADDRESS_OPTIONS = '-c timezone=Asia/Tokyo -c statement_timeout=4321';
const UTC_SESSION_CHECK = `
    DO $$ BEGIN
        IF current_setting('TimeZone') <> 'UTC' THEN
            RAISE EXCEPTION 'session time zone is %', current_setting('TimeZone');
        END IF;
    END $$;
`;

type Settings = { timeZone: string; statementTimeout: string };
type Stored = { storedAt: string };
type Database = { name: string };

const settingsOf = async (
    db: Pick<PrismaClient, '$queryRaw'>,
): Promise<Settings | undefined> => {
    const rows = await db.$queryRaw<Settings[]>`
        SELECT current_setting('TimeZone') AS "timeZone",
               current_setting('statement_timeout') AS "statementTimeout"
    `;
    return rows[0];
};

const storedAt = async (
    db: DbService,
    id: string,
): Promise<string | undefined> => {
    const rows = await db.$queryRaw<Stored[]>`
        SELECT to_char(
                   created_at AT TIME ZONE 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
               ) AS "storedAt"
        FROM identity.accounts
        WHERE id = ${id}::uuid
    `;
    return rows[0]?.storedAt;
};

const alterDatabase = async (db: DbService, change: string): Promise<void> => {
    const rows = await db.$queryRaw<Database[]>`
        SELECT current_database() AS name
    `;
    const name = rows[0]?.name;
    if (name === undefined) {
        throw new Error('The database did not tell its name');
    }
    await db.$executeRawUnsafe(`ALTER DATABASE "${name}" ${change}`);
};

describe('Database session time zone (e2e)', () => {
    const testApp = useTestApp();
    const databaseUrl = (): string =>
        testApp.app.get(ConfigService).getOrThrow<string>('DATABASE_URL');
    const connect = async (url: string): Promise<DbService> => {
        const db = new DbService(new ConfigService({ DATABASE_URL: url }));
        await db.onModuleInit();
        return db;
    };

    it('runs the application sessions in UTC', async () => {
        expect((await settingsOf(testApp.db))?.timeZone).toBe('UTC');
    });

    it('keeps the options of the address and still ends up in UTC', async () => {
        const url = new URL(databaseUrl());
        url.searchParams.set('options', ADDRESS_OPTIONS);
        const db = await connect(url.toString());

        const settings = await settingsOf(db);
        await db.$disconnect();

        expect(settings).toEqual({
            timeZone: 'UTC',
            statementTimeout: '4321ms',
        });
    });

    it('refuses a session that is not in UTC', async () => {
        await expect(
            testApp.app.get(Transactions).run(async (tx) => {
                await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Tokyo'`;
                await assertUtcSession(tx);
            }),
        ).rejects.toThrow(
            'Database session time zone must be UTC, got Asia/Tokyo',
        );
    });

    describe('when the database default is not UTC', () => {
        let db: DbService;

        beforeAll(async () => {
            await alterDatabase(
                testApp.db,
                `SET timezone TO '${SERVER_TIME_ZONE}'`,
            );
            db = await connect(databaseUrl());
        });

        afterAll(async () => {
            await db.$disconnect();
            await alterDatabase(testApp.db, 'RESET timezone');
        });

        it('gives a session without the application setting the default zone', async () => {
            const plain = new PrismaClient({
                adapter: new PrismaPg({ connectionString: databaseUrl() }),
            });

            const settings = await settingsOf(plain);
            await plain.$disconnect();

            expect(settings?.timeZone).toBe(SERVER_TIME_ZONE);
        });

        it('still runs the application sessions in UTC', async () => {
            expect((await settingsOf(db))?.timeZone).toBe('UTC');
        });

        it('stores the instant of a typed write, as a raw read shows', async () => {
            const id = testApp.app.get(Ids).next();

            await db.account.create({
                data: accountRow.build({
                    id,
                    createdAt: WALL_TIME_MISSING_IN_CHISINAU,
                }),
                select: { id: true },
            });

            expect(await storedAt(db, id)).toBe(
                WALL_TIME_MISSING_IN_CHISINAU.toISOString(),
            );
        });

        it('stores the instant of a raw write, as a typed read shows', async () => {
            const id = testApp.app.get(Ids).next();
            await db.account.create({
                data: accountRow.build({
                    id,
                    createdAt: WALL_TIME_MISSING_IN_CHISINAU,
                }),
                select: { id: true },
            });

            await db.$executeRaw`
                UPDATE identity.accounts
                SET created_at = ${NEXT_HOUR}
                WHERE id = ${id}::uuid
            `;
            const row = await db.account.findUniqueOrThrow({
                where: { id },
                select: { createdAt: true },
            });

            expect(row.createdAt).toEqual(NEXT_HOUR);
            expect(await storedAt(db, id)).toBe(NEXT_HOUR.toISOString());
        });

        it('runs the migration sessions in UTC', () => {
            expect(() =>
                execFileSync(
                    'node_modules/.bin/prisma',
                    ['db', 'execute', '--stdin'],
                    {
                        input: UTC_SESSION_CHECK,
                        stdio: ['pipe', 'ignore', 'pipe'],
                        env: { ...process.env, NODE_ENV: 'e2e' },
                    },
                ),
            ).not.toThrow();
        });
    });
});
