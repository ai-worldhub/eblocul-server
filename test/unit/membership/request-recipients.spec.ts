import type { NodeAssignmentSnapshot } from '../../../src/core/membership/domain/entities/node-assignment.entity.ts';
import type { AssignmentRole } from '../../../src/core/membership/domain/rules/assignment-places.ts';
import { recipientsAmong } from '../../../src/core/membership/domain/rules/request-recipients.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const ID_PREFIX = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b';
const ZONE_ADMIN = `${ID_PREFIX}01`;
const BUILDING_ADMIN = `${ID_PREFIX}02`;
const CHIEF = `${ID_PREFIX}03`;
const CHAIRMAN = `${ID_PREFIX}04`;

let sequence = 10;

const held = (
    accountId: string,
    role: AssignmentRole,
    endedAt: Date | null = null,
): NodeAssignmentSnapshot => {
    sequence += 1;
    return {
        id: `${ID_PREFIX}${sequence}`,
        accountId,
        nodeId: `${ID_PREFIX}99`,
        role,
        startedAt: NOW,
        endedAt,
    };
};

describe('recipientsAmong', () => {
    it('sends the request to every administrator whose perimeter covers the node', () => {
        expect(
            recipientsAmong([
                held(BUILDING_ADMIN, 'administrator'),
                held(ZONE_ADMIN, 'administrator'),
                held(CHIEF, 'chief_administrator'),
            ]),
        ).toEqual({
            role: 'administrator',
            accountIds: [BUILDING_ADMIN, ZONE_ADMIN],
        });
    });

    it('names an administrator once when two of his nodes cover the place', () => {
        expect(
            recipientsAmong([
                held(ZONE_ADMIN, 'administrator'),
                held(ZONE_ADMIN, 'administrator'),
            ]),
        ).toEqual({ role: 'administrator', accountIds: [ZONE_ADMIN] });
    });

    it('falls back to the chief administrator when no administrator is active', () => {
        expect(
            recipientsAmong([
                held(ZONE_ADMIN, 'administrator', NOW),
                held(CHIEF, 'chief_administrator'),
            ]),
        ).toEqual({ role: 'chief_administrator', accountIds: [CHIEF] });
    });

    it('never routes to a chairman or by a zone takeover record', () => {
        expect(
            recipientsAmong([
                held(CHAIRMAN, 'chairman'),
                held(CHIEF, 'zone_takeover'),
            ]),
        ).toEqual({ role: null, accountIds: [] });
    });

    it('answers nobody when nobody is assigned', () => {
        expect(recipientsAmong([])).toEqual({ role: null, accountIds: [] });
    });
});
