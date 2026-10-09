import {
    type Actor,
    type Method,
    sendAs,
    signedInAs,
} from '../../utils/access-actors.ts';
import { useAccessProbe } from '../../utils/access-probe-setup.ts';
import { buildWorld, type World } from '../../utils/access-world.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';

const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const MATRIX_TIMEOUT_MS = 60_000;

const ACTORS = [
    'zoneAdmin',
    'chairman',
    'chief',
    'houseAdmin',
    'owner',
    'family',
    'tenant',
    'guard',
    'nobody',
] as const;

type ActorName = (typeof ACTORS)[number];

type Statuses = [
    zoneAdmin: number,
    chairman: number,
    chief: number,
    houseAdmin: number,
    owner: number,
    family: number,
    tenant: number,
    guard: number,
    nobody: number,
];

type Row = [
    request: string,
    method: Method,
    path: (world: World) => string,
    statuses: Statuses,
];

const ROWS: Row[] = [
    [
        'read the list of records',
        'get',
        () => '/probe/records',
        [200, 200, 200, 200, 200, 200, 200, 403, 403],
    ],
    [
        'read house 3 of the zone',
        'get',
        (w) => `/probe/nodes/${w.building.id}/records`,
        [200, 200, 200, 404, 200, 200, 200, 403, 403],
    ],
    [
        'read house 4 of the zone',
        'get',
        (w) => `/probe/nodes/${w.house4.id}/records`,
        [200, 200, 200, 404, 404, 404, 404, 403, 403],
    ],
    [
        'read the other zone',
        'get',
        (w) => `/probe/nodes/${w.housesZone.id}/records`,
        [404, 404, 200, 404, 404, 404, 404, 403, 403],
    ],
    [
        'read the records of the quarter node',
        'get',
        (w) => `/probe/nodes/${w.quarter.id}/records`,
        [403, 403, 200, 404, 200, 200, 200, 403, 403],
    ],
    [
        'read the single house: another complex',
        'get',
        (w) => `/probe/nodes/${w.house.id}/records`,
        [404, 404, 404, 200, 404, 404, 404, 403, 403],
    ],
    [
        'read a node that does not exist',
        'get',
        () => `/probe/nodes/${UNKNOWN_ID}/records`,
        [404, 404, 404, 404, 404, 404, 404, 403, 403],
    ],
    [
        'read the settings of the quarter',
        'get',
        (w) => `/probe/nodes/${w.quarter.id}/settings`,
        [200, 200, 200, 404, 403, 403, 403, 403, 403],
    ],
    [
        'change house 3 of the zone',
        'post',
        (w) => `/probe/nodes/${w.building.id}/records`,
        [201, 403, 403, 404, 403, 403, 403, 403, 403],
    ],
    [
        'change the other zone, which has no administrator',
        'post',
        (w) => `/probe/nodes/${w.line.id}/records`,
        [404, 404, 403, 404, 404, 404, 404, 403, 403],
    ],
    [
        'change the settings of the quarter',
        'patch',
        (w) => `/probe/nodes/${w.quarter.id}/settings`,
        [403, 403, 200, 404, 403, 403, 403, 403, 403],
    ],
    [
        'handle the requests of the zone with an administrator',
        'post',
        (w) => `/probe/nodes/${w.building.id}/requests/handle`,
        [200, 403, 403, 404, 403, 403, 403, 403, 403],
    ],
    [
        'handle the requests of the zone without an administrator',
        'post',
        (w) => `/probe/nodes/${w.line.id}/requests/handle`,
        [404, 404, 200, 404, 404, 404, 404, 403, 403],
    ],
    [
        'deactivate a resident of the zone',
        'post',
        (w) => `/probe/units/${w.apartment.id}/residents/deactivate`,
        [200, 403, 200, 404, 403, 403, 403, 403, 403],
    ],
    [
        'read the unit',
        'get',
        (w) => `/probe/units/${w.apartment.id}`,
        [200, 200, 200, 404, 200, 200, 200, 403, 403],
    ],
    [
        'read the unit of a neighbour',
        'get',
        (w) => `/probe/units/${w.neighbourApartment.id}`,
        [200, 200, 200, 404, 404, 404, 404, 403, 403],
    ],
    [
        'issue a code for the unit',
        'post',
        (w) => `/probe/units/${w.apartment.id}/codes`,
        [403, 403, 403, 404, 201, 403, 403, 403, 403],
    ],
    [
        'create a ticket in the entrance',
        'post',
        (w) => `/probe/nodes/${w.entrance.id}/tickets`,
        [403, 403, 403, 404, 201, 201, 201, 403, 403],
    ],
    [
        'create a ticket in house 4',
        'post',
        (w) => `/probe/nodes/${w.house4.id}/tickets`,
        [403, 403, 403, 404, 404, 404, 404, 403, 403],
    ],
];

type Cast = Record<ActorName, { actor: Actor; grantId: string }>;

const tableOf = (
    cell: (row: Row, actor: ActorName, column: number) => number,
): Record<string, Record<ActorName, number>> =>
    Object.fromEntries(
        ROWS.map((row) => [
            row[0],
            Object.fromEntries(
                ACTORS.map((actor, column) => [
                    actor,
                    cell(row, actor, column),
                ]),
            ) as Record<ActorName, number>,
        ]),
    );

describe('Role × action matrix (e2e)', () => {
    const probe = useAccessProbe();
    const setup = membershipSetupOf(probe);

    const cast = async (world: World): Promise<Cast> => {
        const zoneAdminId = await setup.addAccount();
        const chairmanId = await setup.addAccount();
        const chiefId = await setup.addAccount();
        const houseAdminId = await setup.addAccount();
        const ownerId = await setup.addAccount();
        const familyId = await setup.addAccount();
        const tenantId = await setup.addAccount();
        const nobodyId = await setup.addAccount();
        const zoneAdmin = await setup.assign(
            zoneAdminId,
            world.apartmentsZone.id,
            'administrator',
        );
        const chairman = await setup.assign(
            chairmanId,
            world.apartmentsZone.id,
            'chairman',
        );
        const chief = await setup.assign(
            chiefId,
            world.quarter.id,
            'chief_administrator',
        );
        const houseAdmin = await setup.assign(
            houseAdminId,
            world.house.id,
            'administrator',
        );
        const owner = await setup.bind(ownerId, world.apartment.id, 'owner');
        const family = await setup.bind(
            familyId,
            world.apartment.id,
            'family_member',
        );
        const tenant = await setup.bind(tenantId, world.apartment.id, 'tenant');
        const panel = (accountId: string): Promise<Actor> =>
            signedInAs(probe, accountId, 'admin_panel');
        const phone = (accountId: string): Promise<Actor> =>
            signedInAs(probe, accountId, 'resident_app');
        return {
            zoneAdmin: {
                actor: await panel(zoneAdminId),
                grantId: zoneAdmin.id,
            },
            chairman: { actor: await panel(chairmanId), grantId: chairman.id },
            chief: { actor: await panel(chiefId), grantId: chief.id },
            houseAdmin: {
                actor: await panel(houseAdminId),
                grantId: houseAdmin.id,
            },
            owner: { actor: await phone(ownerId), grantId: owner.id },
            family: { actor: await phone(familyId), grantId: family.id },
            tenant: { actor: await phone(tenantId), grantId: tenant.id },
            guard: {
                actor: await signedInAs(probe, zoneAdminId, 'guard_panel'),
                grantId: zoneAdmin.id,
            },
            nobody: { actor: await panel(nobodyId), grantId: UNKNOWN_ID },
        };
    };

    it(
        'answers every role on every action exactly as the table says',
        async () => {
            const world = await buildWorld(probe);
            const people = await cast(world);
            const answered = new Map<string, number>();

            for (const row of ROWS) {
                for (const name of ACTORS) {
                    const { actor, grantId } = people[name];
                    const response = await sendAs(
                        probe,
                        actor,
                        grantId,
                        row[1],
                        row[2](world),
                    );
                    answered.set(`${row[0]} / ${name}`, response.status);
                }
            }

            expect(answered.size).toBe(ROWS.length * ACTORS.length);
            expect(
                tableOf(
                    (row, actor) => answered.get(`${row[0]} / ${actor}`) ?? 0,
                ),
            ).toEqual(tableOf((row, _actor, column) => row[3][column] ?? 0));
        },
        MATRIX_TIMEOUT_MS,
    );
});
