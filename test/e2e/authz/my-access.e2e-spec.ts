import { LAB_SEEDS } from '../../../src/app/lab-seeds.ts';
import { TEST_ADMIN } from '../../../src/core/identity/index.ts';
import {
    TEST_CHAIRMAN,
    TEST_CHIEF,
    TEST_ZONE_ADMIN,
} from '../../../src/core/membership/application/seeds/test-roles.seed.ts';
import { TEST_HOUSE, TEST_QUARTER } from '../../../src/core/structure/index.ts';
import { type Actor, sendAs, signedInAs } from '../../utils/access-actors.ts';
import {
    cookieHeader,
    issuedCookie,
    PANEL_ORIGIN,
    signIn,
} from '../../utils/admin-session.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';
import { responseBody } from '../../utils/response-body.ts';
import { createSeedRun } from '../../utils/seed-runner.ts';
import { seedTree } from '../../utils/seeded-tree.ts';

const ACCESS_PATH = '/api/v1/me/access';
const SEED_PASSWORD = 'e2e-password-not-real-1';

type NodeReference = { id: string; kind: string; name: string };

type Grant = {
    id: string;
    role: string;
    isReadOnly: boolean;
    complex: { id: string; name: string };
    node: NodeReference | null;
    takenZones: { id: string; name: string; takenAt: string }[];
    unit: {
        id: string;
        type: string;
        number: string;
        floor: number | null;
    } | null;
    chain: NodeReference[];
};

type MyAccess = { accountId: string; application: string; grants: Grant[] };

describe('GET /me/access (e2e)', () => {
    const testApp = useTestApp();
    const setup = membershipSetupOf(testApp);

    const accessOf = async (actor: Actor): Promise<MyAccess> =>
        responseBody<MyAccess>(
            await sendAs(testApp, actor, null, 'get', '/me/access').expect(200),
        );

    const panel = (accountId: string): Promise<Actor> =>
        signedInAs(testApp, accountId, 'admin_panel');
    const phone = (accountId: string): Promise<Actor> =>
        signedInAs(testApp, accountId, 'resident_app');

    it('asks for a session', async () => {
        const response = await testApp.http().get(ACCESS_PATH).expect(401);

        expect(responseBody<{ code: string }>(response).code).toBe(
            'IDENTITY_SESSION_REQUIRED',
        );
    });

    it('gives the administrator from the seeds his role and his perimeter after he signs in', async () => {
        const run = await createSeedRun(LAB_SEEDS);
        await run.runner.run();
        await run.close();
        const seeded: [
            string,
            Omit<Grant, 'id' | 'complex' | 'node'>,
            string,
            string,
            string,
        ][] = [
            [
                TEST_ADMIN.email,
                {
                    role: 'administrator',
                    isReadOnly: false,
                    takenZones: [],
                    unit: null,
                    chain: [],
                },
                TEST_HOUSE.name,
                'building',
                TEST_HOUSE.name,
            ],
            [
                TEST_CHAIRMAN.email,
                {
                    role: 'chairman',
                    isReadOnly: true,
                    takenZones: [],
                    unit: null,
                    chain: [],
                },
                TEST_HOUSE.name,
                'building',
                TEST_HOUSE.name,
            ],
            [
                TEST_CHIEF.email,
                {
                    role: 'chief_administrator',
                    isReadOnly: false,
                    takenZones: [],
                    unit: null,
                    chain: [],
                },
                TEST_QUARTER.name,
                'quarter',
                TEST_QUARTER.name,
            ],
            [
                TEST_ZONE_ADMIN.email,
                {
                    role: 'administrator',
                    isReadOnly: false,
                    takenZones: [],
                    unit: null,
                    chain: [],
                },
                TEST_QUARTER.name,
                'zone',
                TEST_QUARTER.apartmentsZone.name,
            ],
        ];

        for (const [email, grant, complexName, nodeKind, nodeName] of seeded) {
            const cookie = issuedCookie(
                await signIn(testApp, {
                    email,
                    password: SEED_PASSWORD,
                }).expect(200),
            );
            const access = responseBody<MyAccess>(
                await testApp
                    .http()
                    .get(ACCESS_PATH)
                    .set('Cookie', cookieHeader(cookie?.value ?? ''))
                    .set('Origin', PANEL_ORIGIN)
                    .expect(200),
            );

            expect(access.application).toBe('admin_panel');
            expect(access.grants).toEqual([
                {
                    ...grant,
                    id: expect.any(String) as string,
                    complex: {
                        id: expect.any(String) as string,
                        name: complexName,
                    },
                    node: {
                        id: expect.any(String) as string,
                        kind: nodeKind,
                        name: nodeName,
                    },
                },
            ]);
        }
    });

    it('answers an account without roles with an empty list', async () => {
        const accountId = await setup.addAccount();

        expect(await accessOf(await panel(accountId))).toEqual({
            accountId,
            application: 'admin_panel',
            grants: [],
        });
        expect(await accessOf(await phone(accountId))).toEqual({
            accountId,
            application: 'resident_app',
            grants: [],
        });
    });

    it('lists both roles of an account that is the administrator and the chairman', async () => {
        const { house } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const asAdministrator = await setup.assign(
            accountId,
            house.id,
            'administrator',
        );
        const asChairman = await setup.assign(accountId, house.id, 'chairman');

        const { grants } = await accessOf(await panel(accountId));

        expect(
            grants.map(({ id, role, isReadOnly, node }) => ({
                id,
                role,
                isReadOnly,
                nodeId: node?.id,
            })),
        ).toEqual([
            {
                id: asAdministrator.id,
                role: 'administrator',
                isReadOnly: false,
                nodeId: house.id,
            },
            {
                id: asChairman.id,
                role: 'chairman',
                isReadOnly: true,
                nodeId: house.id,
            },
        ]);
    });

    it('shows the chief administrator the zones he has taken, with the date, as a part of his role', async () => {
        const { quarter, housesZone, apartmentsZone } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const chief = await setup.assign(
            accountId,
            quarter.id,
            'chief_administrator',
        );
        const taken = await setup.takeZone(accountId, housesZone.id);
        const returned = await setup.takeZone(accountId, apartmentsZone.id);
        await setup.returnZone(returned.id);

        const { grants } = await accessOf(await panel(accountId));

        expect(grants).toEqual([
            {
                id: chief.id,
                role: 'chief_administrator',
                isReadOnly: false,
                complex: { id: quarter.id, name: quarter.name },
                node: { id: quarter.id, kind: 'quarter', name: quarter.name },
                takenZones: [
                    {
                        id: housesZone.id,
                        name: housesZone.name,
                        takenAt: taken.startedAt.toISOString(),
                    },
                ],
                unit: null,
                chain: [],
            },
        ]);
    });

    it('shows a resident every unit with its chain from the root of the complex down', async () => {
        const tree = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const inQuarter = await setup.bind(
            accountId,
            tree.apartment.id,
            'owner',
        );
        const inHouse = await setup.bind(
            accountId,
            tree.houseApartment.id,
            'tenant',
        );
        const reference = (node: NodeReference): NodeReference => ({
            id: node.id,
            kind: node.kind,
            name: node.name,
        });

        const access = await accessOf(await phone(accountId));

        expect(access).toEqual({
            accountId,
            application: 'resident_app',
            grants: [
                {
                    id: inQuarter.id,
                    role: 'owner',
                    isReadOnly: false,
                    complex: { id: tree.quarter.id, name: tree.quarter.name },
                    node: null,
                    takenZones: [],
                    unit: {
                        id: tree.apartment.id,
                        type: 'apartment',
                        number: tree.apartment.number,
                        floor: tree.apartment.floor,
                    },
                    chain: [
                        tree.quarter,
                        tree.apartmentsZone,
                        tree.building,
                        tree.entrance,
                    ].map(reference),
                },
                {
                    id: inHouse.id,
                    role: 'tenant',
                    isReadOnly: false,
                    complex: { id: tree.house.id, name: tree.house.name },
                    node: null,
                    takenZones: [],
                    unit: {
                        id: tree.houseApartment.id,
                        type: 'apartment',
                        number: tree.houseApartment.number,
                        floor: tree.houseApartment.floor,
                    },
                    chain: [tree.house, tree.houseEntrance].map(reference),
                },
            ],
        });
    });

    it('shows a session only the grants of its own application', async () => {
        const { house, houseApartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const assignment = await setup.assign(
            accountId,
            house.id,
            'administrator',
        );
        const membership = await setup.bind(
            accountId,
            houseApartment.id,
            'owner',
        );

        const inPanel = await accessOf(await panel(accountId));
        const inApp = await accessOf(await phone(accountId));
        const atGuardPost = await accessOf(
            await signedInAs(testApp, accountId, 'guard_panel'),
        );

        expect(inPanel.grants.map((grant) => grant.id)).toEqual([
            assignment.id,
        ]);
        expect(inApp.grants.map((grant) => grant.id)).toEqual([membership.id]);
        expect(atGuardPost).toEqual({
            accountId,
            application: 'guard_panel',
            grants: [],
        });
    });

    it('drops a grant from the list as soon as it has ended', async () => {
        const { house, houseApartment } = await seedTree(testApp);
        const accountId = await setup.addAccount();
        const assignment = await setup.assign(
            accountId,
            house.id,
            'administrator',
        );
        const membership = await setup.bind(
            accountId,
            houseApartment.id,
            'owner',
        );
        const inPanel = await panel(accountId);
        const inApp = await phone(accountId);

        await setup.endAssignment(assignment.id);
        await setup.endMembership(membership.id);

        expect((await accessOf(inPanel)).grants).toEqual([]);
        expect((await accessOf(inApp)).grants).toEqual([]);
    });
});
