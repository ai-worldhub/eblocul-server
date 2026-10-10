import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { CUT_OFF_BY_STATEMENT_LIMIT, holdLock } from '../../utils/held-lock.ts';
import { accountRow } from '../../factories/identity.factory.ts';

const STATEMENT_LIMIT = '5s';
const CUT_OFF_TEST_TIMEOUT_MS = 15_000;

type Limit = { statementTimeout: string };

class Refused extends Error {}

describe('Transactions (e2e)', () => {
    const testApp = useTestApp();

    it('keeps what the work wrote and returns its result', async () => {
        const id = testApp.app.get(Ids).next();

        const result = await testApp.app.get(Transactions).run(async (tx) => {
            await tx.account.create({
                data: accountRow.build({ id }),
                select: { id: true },
            });
            return 'done';
        });

        expect(result).toBe('done');
        expect(await testApp.db.account.count({ where: { id } })).toBe(1);
    });

    it('writes nothing when the work throws, and passes the error on', async () => {
        const id = testApp.app.get(Ids).next();

        await expect(
            testApp.app.get(Transactions).run(async (tx) => {
                await tx.account.create({
                    data: accountRow.build({ id }),
                    select: { id: true },
                });
                throw new Refused('no');
            }),
        ).rejects.toBeInstanceOf(Refused);

        expect(await testApp.db.account.count({ where: { id } })).toBe(0);
    });

    it('limits every statement of the work and no statement outside it', async () => {
        const limitOf = async (
            session: Pick<typeof testApp.db, '$queryRaw'>,
        ): Promise<string | undefined> => {
            const rows = await session.$queryRaw<Limit[]>`
                SELECT current_setting('statement_timeout') AS "statementTimeout"
            `;
            return rows[0]?.statementTimeout;
        };
        const outside = await limitOf(testApp.db);

        const inside = await testApp.app
            .get(Transactions)
            .run((tx) => limitOf(tx));

        expect(inside).toBe(STATEMENT_LIMIT);
        expect(outside).not.toBe(STATEMENT_LIMIT);
        expect(await limitOf(testApp.db)).toBe(outside);
    });

    it(
        'cuts off a statement that waits for a locked row longer than the limit and writes nothing',
        async () => {
            const id = testApp.app.get(Ids).next();
            await testApp.db.account.create({
                data: accountRow.build({ id, firstName: 'Before' }),
                select: { id: true },
            });
            const lock = await holdLock(
                testApp.db,
                (tx) => tx.$queryRaw`
                    SELECT 1 FROM identity.accounts WHERE id = ${id}::uuid FOR UPDATE
                `,
            );

            try {
                await expect(
                    testApp.app.get(Transactions).run((tx) =>
                        tx.account.update({
                            where: { id },
                            data: { firstName: 'After' },
                            select: { id: true },
                        }),
                    ),
                ).rejects.toMatchObject(CUT_OFF_BY_STATEMENT_LIMIT);
            } finally {
                await lock.release();
            }

            expect(
                await testApp.db.account.findUnique({
                    where: { id },
                    select: { firstName: true },
                }),
            ).toEqual({ firstName: 'Before' });
        },
        CUT_OFF_TEST_TIMEOUT_MS,
    );
});
