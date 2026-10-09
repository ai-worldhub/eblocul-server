import {
    UnitMembershipService,
    type UnitMembershipSnapshot,
} from '../../../src/core/membership/index.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import type { Tx } from '../../../src/shared/db/tx.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    membershipRefusalOf,
    membershipSetupOf,
} from '../../utils/membership-setup.ts';
import {
    fulfilledValueOf,
    runOverlapped,
} from '../../utils/overlapped-transactions.ts';
import { seedTree } from '../../utils/seeded-tree.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const HOUR_MS = 3_600_000;
const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const ACTIVE_PAIR_INDEX = 'unit_memberships_active_account_id_unit_id_key';

describe('Unit memberships (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );
    const setup = membershipSetupOf(testApp);

    it('binds an account to a unit with a role, from the moment of the clock', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();

        const membership = await setup.bind(accountId, apartment.id, 'owner');

        expect(membership).toEqual({
            id: membership.id,
            accountId,
            unitId: apartment.id,
            role: 'owner',
            startedAt: clock.now(),
            endedAt: null,
        });
        expect(await testApp.db.unitMembership.findMany()).toEqual([
            membership,
        ]);
    });

    it('binds one account to units of different complexes', async () => {
        const { apartment, houseApartment, privateHouse } =
            await seedTree(testApp);
        const accountId = await setup.addAccount();

        await setup.bind(accountId, apartment.id, 'owner');
        await setup.bind(accountId, privateHouse.id, 'family_member');
        await setup.bind(accountId, houseApartment.id, 'tenant');

        const stored = await testApp.db.unitMembership.findMany({
            where: { accountId, endedAt: null },
            orderBy: { id: 'asc' },
        });
        expect(stored.map(({ unitId, role }) => [unitId, role])).toEqual([
            [apartment.id, 'owner'],
            [privateHouse.id, 'family_member'],
            [houseApartment.id, 'tenant'],
        ]);
    });

    it('returns the active membership when the same one is created again', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const first = await setup.bind(accountId, apartment.id, 'tenant');
        clock.advance(HOUR_MS);

        const repeated = await setup.bind(accountId, apartment.id, 'tenant');

        expect(repeated).toEqual(first);
        expect(await testApp.db.unitMembership.count()).toBe(1);
    });

    it('refuses another role while the membership is active', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        await setup.bind(accountId, apartment.id, 'owner');

        const refusal = await membershipRefusalOf(
            setup.bind(accountId, apartment.id, 'tenant'),
        );

        expect(refusal).toEqual({
            code: 'MEMBERSHIP_UNIT_ROLE_CONFLICT',
            details: { unitId: apartment.id, role: 'owner' },
        });
        expect(await testApp.db.unitMembership.count()).toBe(1);
    });

    it('ends a membership once and keeps the record', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const membership = await setup.bind(accountId, apartment.id, 'tenant');
        clock.advance(HOUR_MS);
        const endedAt = clock.now();

        const ended = await setup.endMembership(membership.id);
        clock.advance(HOUR_MS);
        const repeated = await setup.endMembership(membership.id);

        expect(ended).toEqual({ ...membership, endedAt });
        expect(repeated).toEqual(ended);
        expect(await testApp.db.unitMembership.findMany()).toEqual([ended]);
    });

    it('takes a new role only as a new membership after the old one has ended', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const asTenant = await setup.bind(accountId, apartment.id, 'tenant');
        await setup.endMembership(asTenant.id);

        const asOwner = await setup.bind(accountId, apartment.id, 'owner');

        expect(asOwner.id).not.toBe(asTenant.id);
        expect(asOwner).toMatchObject({ role: 'owner', endedAt: null });
        expect(await testApp.db.unitMembership.count()).toBe(2);
    });

    it('makes a second creation of one membership wait for the first and gives it the same record', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const bindOwner = (tx: Tx): Promise<UnitMembershipSnapshot> =>
            testApp.app.get(UnitMembershipService).bind(tx, {
                accountId,
                unitId: apartment.id,
                role: 'owner',
            });

        const { first, second } = await runOverlapped({
            db: testApp.db,
            transactions: testApp.app.get(Transactions),
            first: bindOwner,
            second: bindOwner,
        });

        expect(fulfilledValueOf(second)).toEqual(first);
        expect(await testApp.db.unitMembership.count()).toBe(1);
    });

    it('refuses an unknown unit, an unknown account and an unknown membership', async () => {
        const { apartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();

        expect(
            await membershipRefusalOf(
                setup.bind(accountId, UNKNOWN_ID, 'owner'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_UNIT_NOT_FOUND',
            details: { unitId: UNKNOWN_ID },
        });
        expect(
            await membershipRefusalOf(
                setup.bind(UNKNOWN_ID, apartment.id, 'owner'),
            ),
        ).toEqual({
            code: 'MEMBERSHIP_ACCOUNT_NOT_FOUND',
            details: { accountId: UNKNOWN_ID },
        });
        expect(
            await membershipRefusalOf(setup.endMembership(UNKNOWN_ID)),
        ).toEqual({
            code: 'MEMBERSHIP_UNIT_MEMBERSHIP_NOT_FOUND',
            details: { membershipId: UNKNOWN_ID },
        });
        expect(await testApp.db.unitMembership.count()).toBe(0);
    });

    it('keeps one active membership per account and unit by a partial unique index', async () => {
        const indexes = await testApp.db.$queryRaw<{ indexdef: string }[]>`
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = 'membership'
              AND indexname = ${ACTIVE_PAIR_INDEX}
        `;

        expect(indexes).toHaveLength(1);
        expect(indexes[0]?.indexdef).toContain('UNIQUE INDEX');
        expect(indexes[0]?.indexdef).toContain('(account_id, unit_id)');
        expect(indexes[0]?.indexdef).toContain('WHERE (ended_at IS NULL)');
    });
});
