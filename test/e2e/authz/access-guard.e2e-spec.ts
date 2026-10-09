import { SYSTEM_ACTOR } from '../../../src/core/journal/index.ts';
import type { Response } from 'supertest';
import { AccessService } from '../../../src/core/authz/index.ts';
import type { SessionApplication } from '../../../src/core/identity/index.ts';
import {
    NodeAssignmentService,
    ZoneTakeoverService,
} from '../../../src/core/membership/index.ts';
import { EventLogger } from '../../../src/shared/logging/event-logger.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import {
    type Actor,
    type Method,
    sendAs,
    signedInAs,
} from '../../utils/access-actors.ts';
import {
    CHANGE_RECORDS,
    CREATE_TICKET,
    HANDLE_REQUESTS,
    type ProbeRecord,
} from '../../utils/access-probe.ts';
import { useAccessProbe } from '../../utils/access-probe-setup.ts';
import { PANEL_ORIGIN } from '../../utils/admin-session.ts';
import { buildWorld, type World } from '../../utils/access-world.ts';
import { EventLoggerDouble } from '../../utils/event-logger.double.ts';
import { membershipSetupOf } from '../../utils/membership-setup.ts';
import {
    type Gate,
    gate,
    runOverlapped,
} from '../../utils/overlapped-transactions.ts';
import { responseBody } from '../../utils/response-body.ts';

const UNKNOWN_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const MALFORMED_ID = 'not-an-id';

type ErrorBody = {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
};

type Listed = { items: ProbeRecord[] };

const refusalOf = (
    response: Response,
): Omit<ErrorBody, 'requestId'> & {
    status: number;
} => {
    const { requestId: _requestId, ...body } =
        responseBody<ErrorBody>(response);
    return { status: response.status, ...body };
};

const idsOf = (nodes: { id: string }[]): string[] =>
    nodes.map((node) => node.id).sort();

describe('Access guard (e2e)', () => {
    const events = new EventLoggerDouble();
    const probe = useAccessProbe((builder) =>
        builder.overrideProvider(EventLogger).useValue(events),
    );
    const setup = membershipSetupOf(probe);

    const panel = (accountId: string): Promise<Actor> =>
        signedInAs(probe, accountId, 'admin_panel');
    const phone = (accountId: string): Promise<Actor> =>
        signedInAs(probe, accountId, 'resident_app');

    const send = (
        actor: Actor,
        grantId: string | null,
        method: Method,
        path: string,
    ): ReturnType<typeof sendAs> => sendAs(probe, actor, grantId, method, path);

    const ownersOf = async (
        actor: Actor,
        grantId: string,
        path = '/probe/records',
    ): Promise<string[]> => {
        const response = await send(actor, grantId, 'get', path).expect(200);
        return responseBody<Listed>(response)
            .items.map((record) => record.ownerNodeId)
            .sort();
    };

    const zoneAdministrator = async (
        world: World,
    ): Promise<{ actor: Actor; grantId: string; accountId: string }> => {
        const accountId = await setup.addAccount();
        const grant = await setup.assign(
            accountId,
            world.apartmentsZone.id,
            'administrator',
        );
        return { actor: await panel(accountId), grantId: grant.id, accountId };
    };

    const resident = async (
        unitId: string,
    ): Promise<{ actor: Actor; grantId: string; accountId: string }> => {
        const accountId = await setup.addAccount();
        const grant = await setup.bind(accountId, unitId, 'tenant');
        return { actor: await phone(accountId), grantId: grant.id, accountId };
    };

    beforeEach(() => {
        events.clear();
    });

    describe('the grant of the request', () => {
        it('asks for a session before anything else', async () => {
            const world = await buildWorld(probe);

            const response = await probe
                .http()
                .get(`/api/v1/probe/nodes/${world.quarter.id}/records`)
                .set('X-Access-Grant', UNKNOWN_ID);

            expect(refusalOf(response)).toMatchObject({
                status: 401,
                code: 'IDENTITY_SESSION_REQUIRED',
            });
        });

        it('lets the panel send the grant header from the browser', async () => {
            const preflight = await probe
                .http()
                .options('/api/v1/probe/records')
                .set('Origin', PANEL_ORIGIN)
                .set('Access-Control-Request-Method', 'GET')
                .set('Access-Control-Request-Headers', 'x-access-grant');

            expect(preflight.status).toBe(204);
            expect(preflight.get('Access-Control-Allow-Origin')).toBe(
                PANEL_ORIGIN,
            );
            expect(
                preflight.get('Access-Control-Allow-Headers')?.toLowerCase(),
            ).toContain('x-access-grant');
        });

        it('answers 400 when the request names no grant', async () => {
            const world = await buildWorld(probe);
            const { actor } = await zoneAdministrator(world);

            const response = await send(actor, null, 'get', '/probe/records');

            expect(refusalOf(response)).toEqual({
                status: 400,
                code: 'AUTHZ_GRANT_REQUIRED',
                message:
                    'Name the grant to act by in the X-Access-Grant header',
            });
        });

        it('gives one answer to a grant that is unknown, malformed, of another account, ended or of another application', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const other = await zoneAdministrator(world);
            const tenant = await resident(world.apartment.id);
            const ended = await setup.assign(
                administrator.accountId,
                world.house.id,
                'administrator',
            );
            await setup.endAssignment(ended.id);

            const refusals = [];
            for (const grantId of [
                UNKNOWN_ID,
                MALFORMED_ID,
                other.grantId,
                ended.id,
                tenant.grantId,
            ]) {
                refusals.push(
                    refusalOf(
                        await send(
                            administrator.actor,
                            grantId,
                            'get',
                            `/probe/nodes/${world.building.id}/records`,
                        ),
                    ),
                );
            }

            expect(refusals).toEqual(
                refusals.map(() => ({
                    status: 403,
                    code: 'AUTHZ_GRANT_NOT_ACTIVE',
                    message: 'The grant is not active',
                })),
            );
        });

        it('does not let the session of one application act by a role of the other, for one and the same account', async () => {
            const world = await buildWorld(probe);
            const accountId = await setup.addAccount();
            const assignment = await setup.assign(
                accountId,
                world.apartmentsZone.id,
                'administrator',
            );
            const membership = await setup.bind(
                accountId,
                world.apartment.id,
                'owner',
            );
            const inPanel = await panel(accountId);
            const inApp = await phone(accountId);
            const path = `/probe/nodes/${world.entrance.id}/records`;

            await send(inPanel, assignment.id, 'get', path).expect(200);
            await send(inApp, membership.id, 'get', path).expect(200);
            const crossed = [
                refusalOf(await send(inApp, assignment.id, 'get', path)),
                refusalOf(await send(inPanel, membership.id, 'get', path)),
            ];

            expect(crossed.map(({ status, code }) => [status, code])).toEqual([
                [403, 'AUTHZ_GRANT_NOT_ACTIVE'],
                [403, 'AUTHZ_GRANT_NOT_ACTIVE'],
            ]);
        });

        it('refuses the very next request of the same session after the grant has ended', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const tenant = await resident(world.apartment.id);

            await send(
                administrator.actor,
                administrator.grantId,
                'get',
                '/probe/records',
            ).expect(200);
            await send(
                tenant.actor,
                tenant.grantId,
                'get',
                '/probe/records',
            ).expect(200);
            await setup.endAssignment(administrator.grantId);
            await setup.endMembership(tenant.grantId);

            const after = [
                refusalOf(
                    await send(
                        administrator.actor,
                        administrator.grantId,
                        'get',
                        '/probe/records',
                    ),
                ),
                refusalOf(
                    await send(
                        tenant.actor,
                        tenant.grantId,
                        'get',
                        '/probe/records',
                    ),
                ),
            ];

            expect(after.map(({ status, code }) => [status, code])).toEqual([
                [403, 'AUTHZ_GRANT_NOT_ACTIVE'],
                [403, 'AUTHZ_GRANT_NOT_ACTIVE'],
            ]);
        });

        it('writes a refusal to the log with the account, the action and the code only', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            events.clear();

            await send(
                administrator.actor,
                administrator.grantId,
                'post',
                `/probe/nodes/${world.line.id}/records`,
            ).expect(404);

            expect(events.named('authz.')).toEqual([
                {
                    event: 'authz.access_refused',
                    fields: {
                        accountId: administrator.accountId,
                        action: 'probe.change_records',
                        code: 'AUTHZ_TARGET_NOT_FOUND',
                    },
                },
            ]);
        });
    });

    describe('what a request does not reveal', () => {
        it('answers a node of another perimeter, a node that does not exist and a malformed id the same way', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);

            const refusals = [];
            for (const nodeId of [
                world.housesZone.id,
                world.house.id,
                UNKNOWN_ID,
                MALFORMED_ID,
            ]) {
                for (const method of ['get', 'post'] as const) {
                    refusals.push(
                        refusalOf(
                            await send(
                                administrator.actor,
                                administrator.grantId,
                                method,
                                `/probe/nodes/${nodeId}/records`,
                            ),
                        ),
                    );
                }
            }

            expect(refusals).toEqual(
                refusals.map(() => ({
                    status: 404,
                    code: 'AUTHZ_TARGET_NOT_FOUND',
                    message: 'Not found',
                })),
            );
        });

        it('answers a unit of another perimeter and a unit that does not exist the same way', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const tenant = await resident(world.apartment.id);

            const refusals = [
                refusalOf(
                    await send(
                        administrator.actor,
                        administrator.grantId,
                        'get',
                        `/probe/units/${world.privateHouse.id}`,
                    ),
                ),
                refusalOf(
                    await send(
                        administrator.actor,
                        administrator.grantId,
                        'get',
                        `/probe/units/${UNKNOWN_ID}`,
                    ),
                ),
                refusalOf(
                    await send(
                        tenant.actor,
                        tenant.grantId,
                        'get',
                        `/probe/units/${world.neighbourApartment.id}`,
                    ),
                ),
                refusalOf(
                    await send(
                        tenant.actor,
                        tenant.grantId,
                        'get',
                        `/probe/units/${UNKNOWN_ID}`,
                    ),
                ),
            ];

            expect(refusals).toEqual(
                refusals.map(() => ({
                    status: 404,
                    code: 'AUTHZ_TARGET_NOT_FOUND',
                    message: 'Not found',
                })),
            );
        });
    });

    describe('what a role reads', () => {
        it('shows a resident of house 3 his chain and nothing of house 4', async () => {
            const world = await buildWorld(probe);
            const tenant = await resident(world.apartment.id);

            expect(await ownersOf(tenant.actor, tenant.grantId)).toEqual(
                idsOf([
                    world.quarter,
                    world.apartmentsZone,
                    world.building,
                    world.entrance,
                ]),
            );
            await send(
                tenant.actor,
                tenant.grantId,
                'get',
                `/probe/nodes/${world.house4.id}/records`,
            ).expect(404);
        });

        it('shows a resident with units in two complexes each complex apart', async () => {
            const world = await buildWorld(probe);
            const accountId = await setup.addAccount();
            const inQuarter = await setup.bind(
                accountId,
                world.privateHouse.id,
                'owner',
            );
            const inHouse = await setup.bind(
                accountId,
                world.houseApartment.id,
                'tenant',
            );
            const actor = await phone(accountId);

            expect(await ownersOf(actor, inQuarter.id)).toEqual(
                idsOf([world.quarter, world.housesZone, world.line]),
            );
            expect(await ownersOf(actor, inHouse.id)).toEqual(
                idsOf([world.house, world.houseEntrance]),
            );
            await send(
                actor,
                inHouse.id,
                'get',
                `/probe/nodes/${world.line.id}/records`,
            ).expect(404);
        });

        it('shows an administrator of a zone his zone only', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const zone = idsOf([
                world.apartmentsZone,
                world.building,
                world.entrance,
                world.house4,
                world.house4Entrance,
            ]);

            expect(
                await ownersOf(administrator.actor, administrator.grantId),
            ).toEqual(zone);
            expect(
                await ownersOf(
                    administrator.actor,
                    administrator.grantId,
                    `/probe/nodes/${world.house4.id}/records`,
                ),
            ).toEqual(idsOf([world.house4, world.house4Entrance]));
        });

        it('shows the chief administrator the whole quarter and no other complex', async () => {
            const world = await buildWorld(probe);
            const accountId = await setup.addAccount();
            const chief = await setup.assign(
                accountId,
                world.quarter.id,
                'chief_administrator',
            );

            expect(await ownersOf(await panel(accountId), chief.id)).toEqual(
                idsOf(
                    world.nodes.filter(
                        (node) => node.complexId === world.quarter.id,
                    ),
                ),
            );
        });

        it('shows a chairman what the administrator of his node reads, and lets him change nothing', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const accountId = await setup.addAccount();
            const chairman = await setup.assign(
                accountId,
                world.apartmentsZone.id,
                'chairman',
            );
            const actor = await panel(accountId);
            const changes: [Method, string][] = [
                ['post', `/probe/nodes/${world.apartmentsZone.id}/records`],
                ['post', `/probe/nodes/${world.building.id}/records`],
                ['patch', `/probe/nodes/${world.apartmentsZone.id}/settings`],
                ['post', `/probe/nodes/${world.entrance.id}/requests/handle`],
                ['post', `/probe/nodes/${world.entrance.id}/tickets`],
                [
                    'post',
                    `/probe/units/${world.apartment.id}/residents/deactivate`,
                ],
                ['post', `/probe/units/${world.apartment.id}/codes`],
            ];

            const refused = [];
            for (const [method, path] of changes) {
                refused.push(
                    refusalOf(await send(actor, chairman.id, method, path)),
                );
            }

            expect(await ownersOf(actor, chairman.id)).toEqual(
                await ownersOf(administrator.actor, administrator.grantId),
            );
            await send(
                actor,
                chairman.id,
                'get',
                `/probe/nodes/${world.quarter.id}/settings`,
            ).expect(200);
            expect(refused.map(({ status, code }) => [status, code])).toEqual(
                changes.map(() => [403, 'AUTHZ_ACTION_FORBIDDEN']),
            );
            expect(
                await probe.db.$queryRaw<{ count: bigint }[]>`
                    SELECT count(*) AS count FROM authz_probe.records
                `,
            ).toEqual([{ count: BigInt(world.nodes.length) }]);
        });
    });

    describe('one account with two roles', () => {
        it('changes as the administrator and is refused the same change as the chairman', async () => {
            const world = await buildWorld(probe);
            const accountId = await setup.addAccount();
            const asAdministrator = await setup.assign(
                accountId,
                world.apartmentsZone.id,
                'administrator',
            );
            const asChairman = await setup.assign(
                accountId,
                world.apartmentsZone.id,
                'chairman',
            );
            const actor = await panel(accountId);
            const path = `/probe/nodes/${world.building.id}/records`;

            const inBoardMode = refusalOf(
                await send(actor, asChairman.id, 'post', path),
            );
            await send(actor, asAdministrator.id, 'post', path).expect(201);

            expect(inBoardMode).toEqual({
                status: 403,
                code: 'AUTHZ_ACTION_FORBIDDEN',
                message: 'The grant does not allow this action here',
                details: { action: 'probe.change_records' },
            });
            await send(actor, asChairman.id, 'get', path).expect(200);
        });
    });

    describe('a change and the end of its grant', () => {
        const opened = async (
            world: World,
            accountId: string,
            grantId: string,
            nodeId: string,
            action = CHANGE_RECORDS,
            application: SessionApplication = 'admin_panel',
        ): Promise<Awaited<ReturnType<AccessService['open']>>> =>
            probe.app
                .get(AccessService)
                .open(
                    { sessionId: world.quarter.id, accountId, application },
                    { grantId, action, target: { kind: 'node', nodeId } },
                );

        const transactions = (): Transactions => probe.app.get(Transactions);

        it('refuses a change whose grant ended after the guard let the request in', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const access = await opened(
                world,
                administrator.accountId,
                administrator.grantId,
                world.building.id,
            );
            await setup.endAssignment(administrator.grantId);

            await expect(
                transactions().run((tx) =>
                    probe.app.get(AccessService).confirm(tx, access, {
                        kind: 'node',
                        nodeId: world.building.id,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'AUTHZ_GRANT_NOT_ACTIVE' });
        });

        it('makes the end of a grant wait for the change that was confirmed by it', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const access = await opened(
                world,
                administrator.accountId,
                administrator.grantId,
                world.building.id,
            );

            const { first, second } = await runOverlapped({
                db: probe.db,
                transactions: transactions(),
                first: (tx) =>
                    probe.app.get(AccessService).confirm(tx, access, {
                        kind: 'node',
                        nodeId: world.building.id,
                    }),
                second: () => setup.endAssignment(administrator.grantId),
            });

            expect(first.complexId).toBe(world.quarter.id);
            expect(second.status).toBe('fulfilled');
        });

        it('refuses a change that waited for the end of its grant', async () => {
            const world = await buildWorld(probe);
            const administrator = await zoneAdministrator(world);
            const access = await opened(
                world,
                administrator.accountId,
                administrator.grantId,
                world.building.id,
            );

            const { second } = await runOverlapped({
                db: probe.db,
                transactions: transactions(),
                first: (tx) =>
                    probe.app
                        .get(NodeAssignmentService)
                        .end(tx, administrator.grantId, SYSTEM_ACTOR),
                second: (tx) =>
                    probe.app.get(AccessService).confirm(tx, access, {
                        kind: 'node',
                        nodeId: world.building.id,
                    }),
            });

            expect(second).toMatchObject({
                status: 'rejected',
                reason: { code: 'AUTHZ_GRANT_NOT_ACTIVE' },
            });
        });

        it('holds the zone takeover of the chief while a change made by it is not committed', async () => {
            const world = await buildWorld(probe);
            const chiefId = await setup.addAccount();
            const chief = await setup.assign(
                chiefId,
                world.quarter.id,
                'chief_administrator',
            );
            const takeover = await setup.takeZone(chiefId, world.housesZone.id);
            const access = await opened(
                world,
                chiefId,
                chief.id,
                world.line.id,
            );

            const held = await runOverlapped({
                db: probe.db,
                transactions: transactions(),
                first: (tx) =>
                    probe.app.get(AccessService).confirm(tx, access, {
                        kind: 'node',
                        nodeId: world.line.id,
                    }),
                second: () => setup.returnZone(takeover.id),
            });

            expect(held.second.status).toBe('fulfilled');
            await expect(
                transactions().run((tx) =>
                    probe.app.get(AccessService).confirm(tx, access, {
                        kind: 'node',
                        nodeId: world.line.id,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'AUTHZ_ACTION_FORBIDDEN' });
        });

        it('checks again the target the guard checked when the change does not name it', async () => {
            const world = await buildWorld(probe);
            const chiefId = await setup.addAccount();
            const chief = await setup.assign(
                chiefId,
                world.quarter.id,
                'chief_administrator',
            );
            const takeover = await setup.takeZone(chiefId, world.housesZone.id);
            const access = await opened(
                world,
                chiefId,
                chief.id,
                world.line.id,
            );
            const confirmed = await transactions().run((tx) =>
                probe.app.get(AccessService).confirm(tx, access),
            );
            await setup.returnZone(takeover.id);

            expect(confirmed.complexId).toBe(world.quarter.id);
            await expect(
                transactions().run((tx) =>
                    probe.app.get(AccessService).confirm(tx, access),
                ),
            ).rejects.toMatchObject({ code: 'AUTHZ_ACTION_FORBIDDEN' });
        });

        it('holds the membership of a resident the same way: its end waits for the change, and a change after it is refused', async () => {
            const world = await buildWorld(probe);
            const tenant = await resident(world.apartment.id);
            const access = await opened(
                world,
                tenant.accountId,
                tenant.grantId,
                world.entrance.id,
                CREATE_TICKET,
                'resident_app',
            );

            const { first, second } = await runOverlapped({
                db: probe.db,
                transactions: transactions(),
                first: (tx) => probe.app.get(AccessService).confirm(tx, access),
                second: () => setup.endMembership(tenant.grantId),
            });

            expect(first.nodeIds).toContain(world.entrance.id);
            expect(second.status).toBe('fulfilled');
            await expect(
                transactions().run((tx) =>
                    probe.app.get(AccessService).confirm(tx, access),
                ),
            ).rejects.toMatchObject({ code: 'AUTHZ_GRANT_NOT_ACTIVE' });
        });

        it('lets one chief take two zones at once, each in a transaction that has confirmed his access', async () => {
            const world = await buildWorld(probe);
            const chiefId = await setup.addAccount();
            const chief = await setup.assign(
                chiefId,
                world.quarter.id,
                'chief_administrator',
            );
            const access = await opened(
                world,
                chiefId,
                chief.id,
                world.quarter.id,
            );
            const first = gate();
            const second = gate();
            const take = (
                zoneId: string,
                mine: Gate,
                other: Gate,
            ): Promise<unknown> =>
                transactions().run(async (tx) => {
                    await probe.app.get(AccessService).confirm(tx, access);
                    mine.open();
                    await other.opened;
                    return probe.app.get(ZoneTakeoverService).takeZone(
                        tx,
                        {
                            accountId: chiefId,
                            nodeId: zoneId,
                        },
                        SYSTEM_ACTOR,
                    );
                });

            const taken = await Promise.allSettled([
                take(world.housesZone.id, first, second),
                take(world.apartmentsZone.id, second, first),
            ]);

            expect(taken.map((result) => result.status)).toEqual([
                'fulfilled',
                'fulfilled',
            ]);
            expect(
                await probe.db.nodeAssignment.count({
                    where: { role: 'zone_takeover', endedAt: null },
                }),
            ).toBe(2);
        });

        it('reads again inside the transaction whether the zone still has no administrator', async () => {
            const world = await buildWorld(probe);
            const chiefId = await setup.addAccount();
            const zoneAdminId = await setup.addAccount();
            const chief = await setup.assign(
                chiefId,
                world.quarter.id,
                'chief_administrator',
            );
            const access = await opened(
                world,
                chiefId,
                chief.id,
                world.line.id,
                HANDLE_REQUESTS,
            );
            await setup.assign(
                zoneAdminId,
                world.housesZone.id,
                'administrator',
            );

            await expect(
                transactions().run((tx) =>
                    probe.app.get(AccessService).confirm(tx, access, {
                        kind: 'node',
                        nodeId: world.line.id,
                    }),
                ),
            ).rejects.toMatchObject({ code: 'AUTHZ_ACTION_FORBIDDEN' });
        });
    });
});
