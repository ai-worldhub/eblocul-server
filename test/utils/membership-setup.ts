import { MembershipError } from '../../src/core/membership/domain/membership.errors.ts';
import {
    type AppointedRole,
    type NodeAssignmentSnapshot,
    NodeAssignmentService,
    type ResidentRole,
    type UnitMembershipSnapshot,
    UnitMembershipService,
    ZoneTakeoverService,
} from '../../src/core/membership/index.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import { accountRow } from '../factories/identity.factory.ts';
import type { TestApp } from './test-app.factory.ts';

export type Refusal = { code: unknown; details: unknown };

export const membershipRefusalOf = async (
    work: Promise<unknown>,
): Promise<Refusal> => {
    const refusal: unknown = await work.then(
        () => null,
        (error: unknown) => error,
    );
    if (!(refusal instanceof MembershipError)) {
        throw new Error('The work was not refused by the membership module');
    }
    return { code: refusal.code, details: refusal.details };
};

export type MembershipSetup = {
    addAccount: () => Promise<string>;
    assign: (
        accountId: string,
        nodeId: string,
        role: AppointedRole,
    ) => Promise<NodeAssignmentSnapshot>;
    endAssignment: (assignmentId: string) => Promise<NodeAssignmentSnapshot>;
    takeZone: (
        accountId: string,
        nodeId: string,
    ) => Promise<NodeAssignmentSnapshot>;
    returnZone: (takeoverId: string) => Promise<NodeAssignmentSnapshot>;
    bind: (
        accountId: string,
        unitId: string,
        role: ResidentRole,
    ) => Promise<UnitMembershipSnapshot>;
    endMembership: (membershipId: string) => Promise<UnitMembershipSnapshot>;
};

export const membershipSetupOf = (
    testApp: Pick<TestApp, 'app' | 'db'>,
): MembershipSetup => {
    const transactions = (): Transactions => testApp.app.get(Transactions);
    const assignments = (): NodeAssignmentService =>
        testApp.app.get(NodeAssignmentService);
    const takeovers = (): ZoneTakeoverService =>
        testApp.app.get(ZoneTakeoverService);
    const memberships = (): UnitMembershipService =>
        testApp.app.get(UnitMembershipService);

    return {
        addAccount: async () => {
            const row = accountRow.build();
            await testApp.db.account.createMany({ data: [row] });
            return row.id;
        },
        assign: (accountId, nodeId, role) =>
            transactions().run((tx) =>
                assignments().assign(tx, { accountId, nodeId, role }),
            ),
        endAssignment: (assignmentId) =>
            transactions().run((tx) => assignments().end(tx, assignmentId)),
        takeZone: (accountId, nodeId) =>
            transactions().run((tx) =>
                takeovers().takeZone(tx, { accountId, nodeId }),
            ),
        returnZone: (takeoverId) =>
            transactions().run((tx) => takeovers().returnZone(tx, takeoverId)),
        bind: (accountId, unitId, role) =>
            transactions().run((tx) =>
                memberships().bind(tx, { accountId, unitId, role }),
            ),
        endMembership: (membershipId) =>
            transactions().run((tx) => memberships().end(tx, membershipId)),
    };
};
