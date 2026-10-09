import {
    type AccessAction,
    coverageOf,
    defineAction,
    rolesOf,
} from '../../../src/core/authz/domain/rules/access-action.ts';

const unchecked = (action: unknown): AccessAction => action as AccessAction;

const refusalOf = (action: unknown): unknown => {
    try {
        defineAction(unchecked(action));
    } catch (error) {
        return error;
    }
    return null;
};

const codeOf = (refusal: unknown): unknown =>
    typeof refusal === 'object' && refusal !== null && 'code' in refusal
        ? refusal.code
        : null;

describe('defineAction', () => {
    it('keeps the name, the kind and the coverage of every granted role', () => {
        const action = defineAction({
            name: 'tickets.change_status',
            kind: 'change',
            grants: {
                administrator: ['perimeter'],
                chief_administrator: ['quarter_node', 'taken_zones'],
            },
        });

        expect(action).toEqual({
            name: 'tickets.change_status',
            kind: 'change',
            grants: {
                administrator: ['perimeter'],
                chief_administrator: ['quarter_node', 'taken_zones'],
            },
        });
        expect(rolesOf(action)).toEqual([
            'chief_administrator',
            'administrator',
        ]);
        expect(coverageOf(action, 'chairman')).toEqual([]);
    });

    it('lets a read-only role read', () => {
        expect(() =>
            defineAction({
                name: 'tickets.read',
                kind: 'read',
                grants: { chairman: ['perimeter', 'ancestors'] },
            }),
        ).not.toThrow();
    });

    it('refuses a changing action granted to the chairman', () => {
        expect(
            refusalOf({
                name: 'tickets.change_status',
                kind: 'change',
                grants: {
                    administrator: ['perimeter'],
                    chairman: ['perimeter'],
                },
            }),
        ).toMatchObject({
            code: 'AUTHZ_ACTION_INVALID',
            details: { action: 'tickets.change_status' },
        });
    });

    it('refuses a name that is not <module>.<action>', () => {
        for (const name of ['tickets', 'Tickets.read', 'tickets.read.all']) {
            expect(
                refusalOf({
                    name,
                    kind: 'read',
                    grants: { administrator: ['perimeter'] },
                }),
            ).toMatchObject({ code: 'AUTHZ_ACTION_INVALID' });
        }
    });

    it('refuses an action without a kind, without roles or with an empty coverage', () => {
        const refused = [
            { name: 'tickets.read', grants: { administrator: ['perimeter'] } },
            {
                name: 'tickets.read',
                kind: 'write',
                grants: { owner: ['chain'] },
            },
            { name: 'tickets.read', kind: 'read', grants: {} },
            { name: 'tickets.read', kind: 'read', grants: { owner: [] } },
        ].map(refusalOf);

        expect(refused.map(codeOf)).toEqual(
            refused.map(() => 'AUTHZ_ACTION_INVALID'),
        );
    });

    it('refuses a coverage the role does not have', () => {
        const refused = [
            { owner: ['perimeter'] },
            { administrator: ['quarter'] },
            { chairman: ['taken_zones'] },
            { chief_administrator: ['perimeter'] },
            { chief_administrator: ['chain'] },
        ].map((grants) =>
            refusalOf({ name: 'tickets.read', kind: 'read', grants }),
        );

        expect(refused.map(codeOf)).toEqual(
            refused.map(() => 'AUTHZ_ACTION_INVALID'),
        );
    });
});
