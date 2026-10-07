import { Ids } from '../../../src/shared/ids/ids.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { accountRow } from '../../factories/identity.factory.ts';

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
});
