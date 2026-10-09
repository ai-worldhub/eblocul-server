import {
    type ResidentRole,
    UnitMembershipEntity,
} from '../../../src/core/membership/domain/entities/unit-membership.entity.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const LATER = new Date('2026-10-10T09:00:00.000Z');
const MEMBERSHIP_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const REPEAT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11';
const ACCOUNT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b20';
const UNIT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b30';
const ROLES: ResidentRole[] = ['owner', 'family_member', 'tenant'];

const start = (role: ResidentRole, id = MEMBERSHIP_ID): UnitMembershipEntity =>
    UnitMembershipEntity.start({
        id,
        accountId: ACCOUNT_ID,
        unitId: UNIT_ID,
        role,
        now: NOW,
    });

describe('UnitMembershipEntity', () => {
    it('starts active with any of the three roles', () => {
        for (const role of ROLES) {
            expect(start(role).view()).toEqual({
                id: MEMBERSHIP_ID,
                accountId: ACCOUNT_ID,
                unitId: UNIT_ID,
                role,
                startedAt: NOW,
                endedAt: null,
            });
        }
    });

    it('accepts a repeat with the same role', () => {
        expect(() =>
            start('tenant').acceptRepeat(start('tenant', REPEAT_ID)),
        ).not.toThrow();
    });

    it('refuses another role while the membership is active', () => {
        expect(() =>
            start('owner').acceptRepeat(start('tenant', REPEAT_ID)),
        ).toThrowError(
            expect.objectContaining({
                code: 'MEMBERSHIP_UNIT_ROLE_CONFLICT',
                details: { unitId: UNIT_ID, role: 'owner' },
            }),
        );
    });

    it('ends once: a repeated end changes nothing', () => {
        const membership = start('family_member');

        expect(membership.end(NOW)).toBe(true);
        expect(membership.end(LATER)).toBe(false);
        expect(membership.view().endedAt).toEqual(NOW);
    });
});
