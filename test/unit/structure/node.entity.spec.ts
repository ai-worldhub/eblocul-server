import { NodeEntity } from '../../../src/core/structure/domain/entities/node.entity.ts';
import type { NodeKind } from '../../../src/core/structure/domain/rules/node-levels.ts';

const NOW = new Date('2026-10-08T09:00:00.000Z');
const ROOT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const CHILD_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11';
const GRANDCHILD_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b12';
const KINDS: NodeKind[] = ['quarter', 'zone', 'building', 'line', 'entrance'];

const root = (kind: NodeKind): NodeEntity =>
    NodeEntity.root({
        id: ROOT_ID,
        kind,
        name: 'Test Complex',
        address: '1 Example Street',
        now: NOW,
    });

const childOf = (
    parent: NodeEntity,
    kind: NodeKind,
    id = CHILD_ID,
): NodeEntity =>
    parent.child({ id, kind, name: 'Test Node', address: null, now: NOW });

const allowedChildren = (parent: NodeEntity): NodeKind[] =>
    KINDS.filter((kind) => {
        try {
            childOf(parent, kind);
            return true;
        } catch {
            return false;
        }
    });

describe('NodeEntity', () => {
    it('starts a complex with a quarter, a zone or a building', () => {
        for (const kind of ['quarter', 'zone', 'building'] as const) {
            expect(root(kind).view()).toEqual({
                id: ROOT_ID,
                complexId: ROOT_ID,
                parentId: null,
                kind,
                name: 'Test Complex',
                address: '1 Example Street',
                createdAt: NOW,
            });
        }
    });

    it('refuses a line or an entrance as the root of a complex', () => {
        for (const kind of ['line', 'entrance'] as const) {
            expect(() => root(kind)).toThrowError(
                expect.objectContaining({
                    code: 'STRUCTURE_ROOT_KIND_FORBIDDEN',
                    details: { kind },
                }),
            );
        }
    });

    it('puts a child into the complex of its parent', () => {
        const quarter = root('quarter');
        const zone = childOf(quarter, 'zone');
        const building = childOf(zone, 'building', GRANDCHILD_ID);

        expect(zone.view()).toMatchObject({
            id: CHILD_ID,
            complexId: ROOT_ID,
            parentId: ROOT_ID,
            kind: 'zone',
        });
        expect(building.view()).toMatchObject({
            id: GRANDCHILD_ID,
            complexId: ROOT_ID,
            parentId: CHILD_ID,
            kind: 'building',
        });
    });

    it('keeps every child below its parent', () => {
        expect(allowedChildren(root('quarter'))).toEqual([
            'zone',
            'building',
            'line',
        ]);
        expect(allowedChildren(root('zone'))).toEqual(['building', 'line']);
        expect(allowedChildren(root('building'))).toEqual(['entrance']);
        expect(allowedChildren(childOf(root('zone'), 'line'))).toEqual([]);
        expect(allowedChildren(childOf(root('building'), 'entrance'))).toEqual(
            [],
        );
    });

    it('lets a level be skipped: a building right under a quarter', () => {
        const building = childOf(root('quarter'), 'building');

        expect(building.view().kind).toBe('building');
        expect(allowedChildren(building)).toEqual(['entrance']);
    });

    it('refuses a building and a line under each other: they share a level', () => {
        expect(() =>
            childOf(childOf(root('zone'), 'line'), 'building'),
        ).toThrowError(
            expect.objectContaining({
                code: 'STRUCTURE_CHILD_KIND_FORBIDDEN',
                details: { parentKind: 'line', childKind: 'building' },
            }),
        );
        expect(() => childOf(root('building'), 'line')).toThrowError(
            expect.objectContaining({ code: 'STRUCTURE_CHILD_KIND_FORBIDDEN' }),
        );
    });

    it('refuses an entrance anywhere but under a building', () => {
        for (const parent of [
            root('quarter'),
            root('zone'),
            childOf(root('zone'), 'line'),
        ]) {
            expect(() => childOf(parent, 'entrance')).toThrowError(
                expect.objectContaining({
                    code: 'STRUCTURE_CHILD_KIND_FORBIDDEN',
                }),
            );
        }
    });

    it('trims the name and refuses a blank one', () => {
        const named = NodeEntity.root({
            id: ROOT_ID,
            kind: 'zone',
            name: '  Test Zone ',
            address: null,
            now: NOW,
        });

        expect(named.view().name).toBe('Test Zone');
        expect(() =>
            NodeEntity.root({
                id: ROOT_ID,
                kind: 'zone',
                name: '   ',
                address: null,
                now: NOW,
            }),
        ).toThrowError(
            expect.objectContaining({ code: 'STRUCTURE_NODE_NAME_BLANK' }),
        );
    });

    it('accepts a retry that names the same parent and kind, whatever the name', () => {
        const zone = root('zone');
        const stored = childOf(zone, 'building');
        const retry = zone.child({
            id: CHILD_ID,
            kind: 'building',
            name: 'Another Name',
            address: '2 Example Street',
            now: NOW,
        });

        expect(() => stored.acceptRetry(retry)).not.toThrow();
        expect(() => root('zone').acceptRetry(root('zone'))).not.toThrow();
    });

    it('refuses a retry under another parent or of another kind', () => {
        const zone = root('zone');
        const stored = childOf(zone, 'building');
        const elsewhere = childOf(zone, 'line', GRANDCHILD_ID);

        for (const retry of [
            childOf(zone, 'line'),
            NodeEntity.restore({
                ...stored.view(),
                parentId: elsewhere.view().id,
            }),
            NodeEntity.restore({ ...stored.view(), parentId: null }),
        ]) {
            expect(() => stored.acceptRetry(retry)).toThrowError(
                expect.objectContaining({
                    code: 'STRUCTURE_ID_TAKEN',
                    details: { id: CHILD_ID },
                }),
            );
        }
    });

    it('stores a blank address as no address', () => {
        const node = NodeEntity.root({
            id: ROOT_ID,
            kind: 'zone',
            name: 'Test Zone',
            address: '  ',
            now: NOW,
        });

        expect(node.view().address).toBeNull();
    });
});
