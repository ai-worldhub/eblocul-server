import { RequestRoutingService } from '../../../src/core/membership/index.ts';
import {
    type Actor,
    type Method,
    sendAs,
    signedInAs,
} from '../../utils/access-actors.ts';
import type { ProbeRecord } from '../../utils/access-probe.ts';
import { useAccessProbe } from '../../utils/access-probe-setup.ts';
import { buildWorld, type World } from '../../utils/access-world.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';
import { responseBody } from '../../utils/response-body.ts';

type Listed = { items: ProbeRecord[] };

type Chief = {
    world: World;
    chiefId: string;
    actor: Actor;
    grantId: string;
};

type Rights = {
    readsZone: number;
    changesZone: number;
    changesSettings: number;
    handlesRequests: number;
    deactivatesResident: number;
};

const ADDED_BY_CHIEF = 'added by chief_administrator';

describe('Rights of the chief administrator in a zone (e2e)', () => {
    const probe = useAccessProbe();
    const setup = membershipSetupOf(probe);

    const chiefOfQuarter = async (): Promise<Chief> => {
        const world = await buildWorld(probe);
        const chiefId = await setup.addAccount();
        const grant = await setup.assign(
            chiefId,
            world.quarter.id,
            'chief_administrator',
        );
        return {
            world,
            chiefId,
            actor: await signedInAs(probe, chiefId, 'admin_panel'),
            grantId: grant.id,
        };
    };

    const statusOf = async (
        actor: Actor,
        grantId: string,
        method: Method,
        path: string,
    ): Promise<number> =>
        (await sendAs(probe, actor, grantId, method, path)).status;

    const rightsIn = async (
        { actor, grantId }: Pick<Chief, 'actor' | 'grantId'>,
        zone: { nodeId: string; innerNodeId: string; unitId: string },
    ): Promise<Rights> => ({
        readsZone: await statusOf(
            actor,
            grantId,
            'get',
            `/probe/nodes/${zone.nodeId}/records`,
        ),
        changesZone: await statusOf(
            actor,
            grantId,
            'post',
            `/probe/nodes/${zone.innerNodeId}/records`,
        ),
        changesSettings: await statusOf(
            actor,
            grantId,
            'patch',
            `/probe/nodes/${zone.nodeId}/settings`,
        ),
        handlesRequests: await statusOf(
            actor,
            grantId,
            'post',
            `/probe/nodes/${zone.innerNodeId}/requests/handle`,
        ),
        deactivatesResident: await statusOf(
            actor,
            grantId,
            'post',
            `/probe/units/${zone.unitId}/residents/deactivate`,
        ),
    });

    const housesZoneOf = (
        world: World,
    ): { nodeId: string; innerNodeId: string; unitId: string } => ({
        nodeId: world.housesZone.id,
        innerNodeId: world.line.id,
        unitId: world.privateHouse.id,
    });

    const apartmentsZoneOf = (
        world: World,
    ): { nodeId: string; innerNodeId: string; unitId: string } => ({
        nodeId: world.apartmentsZone.id,
        innerNodeId: world.building.id,
        unitId: world.apartment.id,
    });

    const titlesUnder = async (
        actor: Actor,
        grantId: string,
        nodeId: string,
    ): Promise<string[]> => {
        const response = await sendAs(
            probe,
            actor,
            grantId,
            'get',
            `/probe/nodes/${nodeId}/records`,
        ).expect(200);
        return responseBody<Listed>(response).items.map(
            (record) => record.title,
        );
    };

    const recipientsOf = (
        nodeId: string,
    ): ReturnType<RequestRoutingService['recipientsOf']> =>
        probe.app.get(RequestRoutingService).recipientsOf(probe.db, nodeId);

    it('a zone without an administrator, before the takeover: the chief reads, handles the requests routed to him and deactivates a resident, and changes nothing else', async () => {
        const chief = await chiefOfQuarter();

        expect(await rightsIn(chief, housesZoneOf(chief.world))).toEqual({
            readsZone: 200,
            changesZone: 403,
            changesSettings: 403,
            handlesRequests: 200,
            deactivatesResident: 200,
        });
        expect(await recipientsOf(chief.world.line.id)).toEqual({
            role: 'chief_administrator',
            accountIds: [chief.chiefId],
        });
    });

    it('a zone without an administrator, after the takeover: the chief has the rights of its administrator, in this zone only', async () => {
        const chief = await chiefOfQuarter();
        const zoneAdminId = await setup.addAccount();
        await setup.assign(
            zoneAdminId,
            chief.world.apartmentsZone.id,
            'administrator',
        );

        await setup.takeZone(chief.chiefId, chief.world.housesZone.id);

        expect(await rightsIn(chief, housesZoneOf(chief.world))).toEqual({
            readsZone: 200,
            changesZone: 201,
            changesSettings: 200,
            handlesRequests: 200,
            deactivatesResident: 200,
        });
        expect(await rightsIn(chief, apartmentsZoneOf(chief.world))).toEqual({
            readsZone: 200,
            changesZone: 403,
            changesSettings: 403,
            handlesRequests: 403,
            deactivatesResident: 200,
        });
        expect(await recipientsOf(chief.world.line.id)).toEqual({
            role: 'chief_administrator',
            accountIds: [chief.chiefId],
        });
    });

    it('the administrator of the zone becomes active: the takeover is gone with his assignment, what the chief created stays in the zone, and the chief only reads again', async () => {
        const chief = await chiefOfQuarter();
        const { world } = chief;
        const zoneAdminId = await setup.addAccount();
        const takeover = await setup.takeZone(
            chief.chiefId,
            world.housesZone.id,
        );
        await sendAs(
            probe,
            chief.actor,
            chief.grantId,
            'post',
            `/probe/nodes/${world.line.id}/records`,
        ).expect(201);

        const administrator = await setup.assign(
            zoneAdminId,
            world.housesZone.id,
            'administrator',
        );
        const zoneAdmin = await signedInAs(probe, zoneAdminId, 'admin_panel');

        expect(
            (
                await probe.db.nodeAssignment.findUniqueOrThrow({
                    where: { id: takeover.id },
                })
            ).endedAt,
        ).not.toBeNull();
        expect(await rightsIn(chief, housesZoneOf(world))).toEqual({
            readsZone: 200,
            changesZone: 403,
            changesSettings: 403,
            handlesRequests: 403,
            deactivatesResident: 200,
        });
        expect(
            await titlesUnder(chief.actor, chief.grantId, world.line.id),
        ).toContain(ADDED_BY_CHIEF);
        expect(
            await titlesUnder(zoneAdmin, administrator.id, world.line.id),
        ).toContain(ADDED_BY_CHIEF);
        expect(
            await rightsIn(
                { actor: zoneAdmin, grantId: administrator.id },
                housesZoneOf(world),
            ),
        ).toEqual({
            readsZone: 200,
            changesZone: 201,
            changesSettings: 200,
            handlesRequests: 200,
            deactivatesResident: 200,
        });
        expect(await recipientsOf(world.line.id)).toEqual({
            role: 'administrator',
            accountIds: [zoneAdminId],
        });
    });

    it('a zone with an active administrator: taken, its requests still go to the administrator, and the takeover ends only when the chief returns the zone', async () => {
        const chief = await chiefOfQuarter();
        const { world } = chief;
        const zoneAdminId = await setup.addAccount();
        const administrator = await setup.assign(
            zoneAdminId,
            world.apartmentsZone.id,
            'administrator',
        );
        const zoneAdmin = await signedInAs(probe, zoneAdminId, 'admin_panel');
        const before = await rightsIn(chief, apartmentsZoneOf(world));

        const takeover = await setup.takeZone(
            chief.chiefId,
            world.apartmentsZone.id,
        );
        const taken = await rightsIn(chief, apartmentsZoneOf(world));
        const administratorWhileTaken = await rightsIn(
            { actor: zoneAdmin, grantId: administrator.id },
            apartmentsZoneOf(world),
        );
        const recipientsWhileTaken = await recipientsOf(world.building.id);
        const stillTaken = await probe.db.nodeAssignment.findUniqueOrThrow({
            where: { id: takeover.id },
        });
        await setup.returnZone(takeover.id);

        expect(before).toEqual({
            readsZone: 200,
            changesZone: 403,
            changesSettings: 403,
            handlesRequests: 403,
            deactivatesResident: 200,
        });
        expect(taken).toEqual({
            readsZone: 200,
            changesZone: 201,
            changesSettings: 200,
            handlesRequests: 200,
            deactivatesResident: 200,
        });
        expect(administratorWhileTaken).toEqual({
            readsZone: 200,
            changesZone: 201,
            changesSettings: 200,
            handlesRequests: 200,
            deactivatesResident: 200,
        });
        expect(recipientsWhileTaken).toEqual({
            role: 'administrator',
            accountIds: [zoneAdminId],
        });
        expect(stillTaken.endedAt).toBeNull();
        expect(await rightsIn(chief, apartmentsZoneOf(world))).toEqual(before);
    });
});
