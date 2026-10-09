import type { TestingModuleBuilder } from '@nestjs/testing';
import { JOURNAL_ACTIONS } from '../../src/app/journal-actions.ts';
import { REGISTERED_JOURNAL_ACTIONS } from '../../src/core/journal/application/registered-actions.ts';
import {
    defineJournalAction,
    type JournalActor,
    JournalService,
} from '../../src/core/journal/index.ts';
import { Clock } from '../../src/shared/clock/clock.service.ts';
import {
    type NodeSnapshot,
    TreeBuildingService,
} from '../../src/core/structure/index.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import { Ids } from '../../src/shared/ids/ids.service.ts';
import type { ClockDouble } from './clock.double.ts';
import { membershipSetupOf } from './membership-setup.ts';
import { type SeededTree, seedTree } from './seeded-tree.ts';
import type { TestApp } from './test-app.factory.ts';

const MINUTE_MS = 60_000;
const BULK_ENTRANCES = 26;

const UNIT_TOUCHED = defineJournalAction({
    name: 'probe.unit_touched',
    details: { attempts: 'integer' },
});

export const withJournalWorld =
    (clock: ClockDouble) =>
    (builder: TestingModuleBuilder): TestingModuleBuilder =>
        builder
            .overrideProvider(Clock)
            .useValue(clock)
            .overrideProvider(REGISTERED_JOURNAL_ACTIONS)
            .useValue([...JOURNAL_ACTIONS, UNIT_TOUCHED]);

type Holder = { accountId: string; grantId: string };

export type JournalWorld = SeededTree & {
    house4: NodeSnapshot;
    bulkZone: NodeSnapshot;
    chief: Holder;
    zoneAdmin: Holder;
    otherZoneAdmin: Holder;
    houseAdmin: Holder;
    house4Admin: Holder;
    chairman: Holder;
    foreignAdmin: Holder;
    resident: Holder;
    entryIds: string[];
    times: Date[];
};

const actor = (
    accountId: string,
    role: 'chief_administrator' | 'administrator',
): JournalActor => ({ kind: 'account', accountId, role });

export const buildJournalWorld = async (
    testApp: Pick<TestApp, 'app' | 'db'>,
    clock: ClockDouble,
): Promise<JournalWorld> => {
    const tree = await seedTree(testApp);
    const setup = membershipSetupOf(testApp);
    const building = testApp.app.get(TreeBuildingService);
    const ids = testApp.app.get(Ids);
    const transactions = testApp.app.get(Transactions);
    const added = await transactions.run(async (tx) => {
        const child = (
            parentId: string,
            kind: 'zone' | 'building' | 'entrance',
            name: string,
        ): Promise<NodeSnapshot> =>
            building.createChild(tx, {
                id: ids.next(),
                parentId,
                kind,
                name,
                address: null,
            });
        const house4 = await child(
            tree.apartmentsZone.id,
            'building',
            'Building 4',
        );
        await child(house4.id, 'entrance', 'Entrance 1');
        const bulkZone = await child(tree.quarter.id, 'zone', 'Bulk Zone');
        const bulkHouse = await child(bulkZone.id, 'building', 'Bulk House');
        for (let number = 1; number <= BULK_ENTRANCES; number += 1) {
            await child(bulkHouse.id, 'entrance', `Entrance ${number}`);
        }
        return { house4, bulkZone };
    });

    const times: Date[] = [];
    const step = async <T>(work: () => Promise<T>): Promise<T> => {
        clock.advance(MINUTE_MS);
        times.push(clock.now());
        return work();
    };
    const [
        chiefId,
        zoneAdminId,
        otherZoneAdminId,
        houseAdminId,
        house4AdminId,
        chairmanId,
        foreignAdminId,
        residentId,
    ] = await Promise.all(Array.from({ length: 8 }, () => setup.addAccount()));
    if (
        chiefId === undefined ||
        zoneAdminId === undefined ||
        otherZoneAdminId === undefined ||
        houseAdminId === undefined ||
        house4AdminId === undefined ||
        chairmanId === undefined ||
        foreignAdminId === undefined ||
        residentId === undefined
    ) {
        throw new Error('The accounts of the journal world are not created');
    }
    const byChief = actor(chiefId, 'chief_administrator');
    const byZoneAdmin = actor(zoneAdminId, 'administrator');

    const chief = await step(() =>
        setup.assign(chiefId, tree.quarter.id, 'chief_administrator'),
    );
    const zoneAdmin = await step(() =>
        setup.assign(
            zoneAdminId,
            tree.apartmentsZone.id,
            'administrator',
            byChief,
        ),
    );
    const otherZoneAdmin = await step(() =>
        setup.assign(
            otherZoneAdminId,
            tree.housesZone.id,
            'administrator',
            byChief,
        ),
    );
    const houseAdmin = await step(() =>
        setup.assign(
            houseAdminId,
            tree.building.id,
            'administrator',
            byZoneAdmin,
        ),
    );
    const chairman = await step(() =>
        setup.assign(chairmanId, tree.building.id, 'chairman'),
    );
    const house4Admin = await step(() =>
        setup.assign(
            house4AdminId,
            added.house4.id,
            'administrator',
            byZoneAdmin,
        ),
    );
    const takeover = await step(() =>
        setup.takeZone(chiefId, tree.housesZone.id, byChief),
    );
    await step(() => setup.returnZone(takeover.id, byChief));
    await step(() =>
        transactions.run((tx) =>
            testApp.app.get(JournalService).record(tx, UNIT_TOUCHED, {
                actor: actor(houseAdminId, 'administrator'),
                nodeId: tree.entrance.id,
                subjectAccountId: residentId,
                subjectUnitId: tree.apartment.id,
                details: { attempts: 2 },
            }),
        ),
    );
    const foreignAdmin = await step(() =>
        setup.assign(foreignAdminId, tree.house.id, 'administrator'),
    );
    const resident = await setup.bind(residentId, tree.apartment.id, 'owner');

    const entries = await testApp.db.journalEntry.findMany({
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
        ...tree,
        ...added,
        chief: { accountId: chiefId, grantId: chief.id },
        zoneAdmin: { accountId: zoneAdminId, grantId: zoneAdmin.id },
        otherZoneAdmin: {
            accountId: otherZoneAdminId,
            grantId: otherZoneAdmin.id,
        },
        houseAdmin: { accountId: houseAdminId, grantId: houseAdmin.id },
        house4Admin: { accountId: house4AdminId, grantId: house4Admin.id },
        chairman: { accountId: chairmanId, grantId: chairman.id },
        foreignAdmin: { accountId: foreignAdminId, grantId: foreignAdmin.id },
        resident: { accountId: residentId, grantId: resident.id },
        entryIds: entries.map((entry) => entry.id),
        times,
    };
};
