import {
    NodeAssignmentService,
    type RequestRecipients,
    RequestRoutingService,
} from '../../../src/core/membership/index.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    membershipRefusalOf,
    membershipSetupOf,
} from '../../utils/membership-setup.ts';
import { type SeededTree, seedTree } from '../../utils/seeded-tree.ts';

const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const NOBODY: RequestRecipients = { role: null, accountIds: [] };

type Quarter = SeededTree & { chiefId: string };

describe('Who receives the requests of a node (e2e)', () => {
    const testApp = useTestApp();
    const setup = membershipSetupOf(testApp);

    const recipientsOf = async (nodeId: string): Promise<RequestRecipients> => {
        const recipients = await testApp.app
            .get(RequestRoutingService)
            .recipientsOf(testApp.db, nodeId);
        return { ...recipients, accountIds: [...recipients.accountIds].sort() };
    };

    const administrators = (...accountIds: string[]): RequestRecipients => ({
        role: 'administrator',
        accountIds: [...accountIds].sort(),
    });

    const chiefs = (...accountIds: string[]): RequestRecipients => ({
        role: 'chief_administrator',
        accountIds: [...accountIds].sort(),
    });

    const quarterWithChief = async (): Promise<Quarter> => {
        const tree = await seedTree(testApp);
        const chiefId = await setup.addAccount();
        await setup.assign(chiefId, tree.quarter.id, 'chief_administrator');
        return { ...tree, chiefId };
    };

    it('sends the requests of a zone and of everything under it to the administrator of the zone', async () => {
        const { apartmentsZone, building, entrance } = await quarterWithChief();
        const zoneAdminId = await setup.addAccount();
        await setup.assign(zoneAdminId, apartmentsZone.id, 'administrator');

        for (const node of [apartmentsZone, building, entrance]) {
            expect(await recipientsOf(node.id)).toEqual(
                administrators(zoneAdminId),
            );
        }
    });

    it('sends the requests of a house to every administrator whose perimeter covers it', async () => {
        const { apartmentsZone, building, entrance } = await quarterWithChief();
        const zoneAdminId = await setup.addAccount();
        const secondZoneAdminId = await setup.addAccount();
        const houseAdminId = await setup.addAccount();
        await setup.assign(zoneAdminId, apartmentsZone.id, 'administrator');
        await setup.assign(
            secondZoneAdminId,
            apartmentsZone.id,
            'administrator',
        );
        await setup.assign(houseAdminId, building.id, 'administrator');

        expect(await recipientsOf(entrance.id)).toEqual(
            administrators(zoneAdminId, secondZoneAdminId, houseAdminId),
        );
        expect(await recipientsOf(building.id)).toEqual(
            administrators(zoneAdminId, secondZoneAdminId, houseAdminId),
        );
        expect(await recipientsOf(apartmentsZone.id)).toEqual(
            administrators(zoneAdminId, secondZoneAdminId),
        );
    });

    it('sends the requests of a zone without an administrator to the chief administrators of the quarter', async () => {
        const { chiefId, quarter, housesZone, line } = await quarterWithChief();
        const secondChiefId = await setup.addAccount();
        await setup.assign(secondChiefId, quarter.id, 'chief_administrator');

        for (const node of [quarter, housesZone, line]) {
            expect(await recipientsOf(node.id)).toEqual(
                chiefs(chiefId, secondChiefId),
            );
        }
    });

    it('sends a house to its own administrator and the zone above it to the chief administrator', async () => {
        const { chiefId, apartmentsZone, building, entrance } =
            await quarterWithChief();
        const houseAdminId = await setup.addAccount();
        await setup.assign(houseAdminId, building.id, 'administrator');

        expect(await recipientsOf(entrance.id)).toEqual(
            administrators(houseAdminId),
        );
        expect(await recipientsOf(building.id)).toEqual(
            administrators(houseAdminId),
        );
        expect(await recipientsOf(apartmentsZone.id)).toEqual(chiefs(chiefId));
    });

    it('does not depend on a zone takeover', async () => {
        const { chiefId, apartmentsZone, housesZone, line } =
            await quarterWithChief();
        const zoneAdminId = await setup.addAccount();
        await setup.assign(zoneAdminId, apartmentsZone.id, 'administrator');
        const before = await recipientsOf(line.id);

        await setup.takeZone(chiefId, housesZone.id);
        await setup.takeZone(chiefId, apartmentsZone.id);

        expect(before).toEqual(chiefs(chiefId));
        expect(await recipientsOf(line.id)).toEqual(chiefs(chiefId));
        expect(await recipientsOf(housesZone.id)).toEqual(chiefs(chiefId));
        expect(await recipientsOf(apartmentsZone.id)).toEqual(
            administrators(zoneAdminId),
        );
    });

    it('moves the requests from the chief administrator to the administrator of the zone once he is assigned, and back when his role ends', async () => {
        const { chiefId, housesZone, line } = await quarterWithChief();
        const zoneAdminId = await setup.addAccount();

        const assignment = await setup.assign(
            zoneAdminId,
            housesZone.id,
            'administrator',
        );
        const withAdministrator = await recipientsOf(line.id);
        await setup.endAssignment(assignment.id);

        expect(withAdministrator).toEqual(administrators(zoneAdminId));
        expect(await recipientsOf(line.id)).toEqual(chiefs(chiefId));
    });

    it('never names a chairman', async () => {
        const { chiefId, housesZone, house } = await quarterWithChief();
        const chairmanId = await setup.addAccount();
        await setup.assign(chairmanId, housesZone.id, 'chairman');
        await setup.assign(chairmanId, house.id, 'chairman');

        expect(await recipientsOf(housesZone.id)).toEqual(chiefs(chiefId));
        expect(await recipientsOf(house.id)).toEqual(NOBODY);
    });

    it('names nobody where there is neither an administrator nor a chief administrator', async () => {
        const { quarter, housesZone, house, houseEntrance } =
            await seedTree(testApp);

        for (const node of [quarter, housesZone, house, houseEntrance]) {
            expect(await recipientsOf(node.id)).toEqual(NOBODY);
        }
    });

    it('keeps complexes apart: the administrator of a single house receives only its requests', async () => {
        const { chiefId, house, houseEntrance, building } =
            await quarterWithChief();
        const houseAdminId = await setup.addAccount();
        await setup.assign(houseAdminId, house.id, 'administrator');

        expect(await recipientsOf(houseEntrance.id)).toEqual(
            administrators(houseAdminId),
        );
        expect(await recipientsOf(building.id)).toEqual(chiefs(chiefId));
    });

    it('sees an assignment made earlier in the same transaction', async () => {
        const { housesZone, line } = await quarterWithChief();
        const zoneAdminId = await setup.addAccount();

        const inside = await testApp.app.get(Transactions).run(async (tx) => {
            await testApp.app.get(NodeAssignmentService).assign(tx, {
                accountId: zoneAdminId,
                nodeId: housesZone.id,
                role: 'administrator',
            });
            return testApp.app
                .get(RequestRoutingService)
                .recipientsOf(tx, line.id);
        });

        expect(inside).toEqual(administrators(zoneAdminId));
    });

    it('refuses an unknown node', async () => {
        expect(await membershipRefusalOf(recipientsOf(UNKNOWN_ID))).toEqual({
            code: 'MEMBERSHIP_NODE_NOT_FOUND',
            details: { nodeId: UNKNOWN_ID },
        });
    });
});
