import {
    NodeEntity,
    type NodeSnapshot,
} from '../../../src/core/structure/domain/entities/node.entity.ts';
import { UnitEntity } from '../../../src/core/structure/domain/entities/unit.entity.ts';
import type { NodeKind } from '../../../src/core/structure/domain/rules/node-levels.ts';
import type { UnitType } from '../../../src/core/structure/domain/rules/unit-placement.ts';

const NOW = new Date('2026-10-08T09:00:00.000Z');
const COMPLEX_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const NODE_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11';
const UNIT_ID = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b12';
const NODE_KINDS: NodeKind[] = [
    'quarter',
    'zone',
    'building',
    'line',
    'entrance',
];
const UNIT_TYPES: UnitType[] = ['apartment', 'townhouse', 'house', 'duplex'];

const node = (kind: NodeKind): NodeSnapshot =>
    NodeEntity.restore({
        id: NODE_ID,
        complexId: COMPLEX_ID,
        parentId: COMPLEX_ID,
        kind,
        name: 'Test Node',
        address: null,
        createdAt: NOW,
    }).view();

const place = (
    kind: NodeKind,
    type: UnitType,
    floor: number | null = null,
    number = '12A',
): UnitEntity =>
    UnitEntity.place({
        id: UNIT_ID,
        node: node(kind),
        type,
        number,
        floor,
        now: NOW,
    });

const nodeKindsFor = (type: UnitType): NodeKind[] =>
    NODE_KINDS.filter((kind) => {
        try {
            place(kind, type);
            return true;
        } catch {
            return false;
        }
    });

describe('UnitEntity', () => {
    it('belongs to its node and to the complex of that node', () => {
        expect(place('entrance', 'apartment', 3).view()).toEqual({
            id: UNIT_ID,
            complexId: COMPLEX_ID,
            nodeId: NODE_ID,
            type: 'apartment',
            number: '12A',
            floor: 3,
            createdAt: NOW,
        });
    });

    it('puts an apartment into a building or an entrance only', () => {
        expect(nodeKindsFor('apartment')).toEqual(['building', 'entrance']);
    });

    it('puts a townhouse, a house and a duplex on a line only', () => {
        expect(nodeKindsFor('townhouse')).toEqual(['line']);
        expect(nodeKindsFor('house')).toEqual(['line']);
        expect(nodeKindsFor('duplex')).toEqual(['line']);
    });

    it('names both kinds when the placement is refused', () => {
        expect(() => place('zone', 'house')).toThrowError(
            expect.objectContaining({
                code: 'STRUCTURE_UNIT_PLACEMENT_FORBIDDEN',
                details: { nodeKind: 'zone', type: 'house' },
            }),
        );
    });

    it('lets an apartment have a floor or none', () => {
        expect(place('entrance', 'apartment', 0).view().floor).toBe(0);
        expect(place('entrance', 'apartment', null).view().floor).toBeNull();
    });

    it('refuses a floor for everything but an apartment', () => {
        for (const type of UNIT_TYPES.filter((each) => each !== 'apartment')) {
            expect(() => place('line', type, 1)).toThrowError(
                expect.objectContaining({
                    code: 'STRUCTURE_UNIT_FLOOR_FORBIDDEN',
                    details: { type },
                }),
            );
            expect(place('line', type, null).view().floor).toBeNull();
        }
    });

    it('refuses a floor that is not a whole number', () => {
        expect(() => place('entrance', 'apartment', 2.5)).toThrowError(
            expect.objectContaining({ code: 'STRUCTURE_UNIT_FLOOR_INVALID' }),
        );
    });

    it('trims the number and refuses a blank one', () => {
        expect(place('line', 'house', null, ' 12A ').view().number).toBe('12A');
        expect(() => place('line', 'house', null, '  ')).toThrowError(
            expect.objectContaining({ code: 'STRUCTURE_UNIT_NUMBER_BLANK' }),
        );
    });

    it('accepts a retry for the same node and type, whatever the number', () => {
        const stored = place('entrance', 'apartment', 3, '12');

        expect(() =>
            stored.acceptRetry(place('entrance', 'apartment', null, '12A')),
        ).not.toThrow();
    });

    it('refuses a retry for another node or of another type', () => {
        const stored = place('line', 'house');
        const elsewhere = UnitEntity.restore({
            ...stored.view(),
            nodeId: COMPLEX_ID,
        });

        for (const retry of [place('line', 'duplex'), elsewhere]) {
            expect(() => stored.acceptRetry(retry)).toThrowError(
                expect.objectContaining({
                    code: 'STRUCTURE_ID_TAKEN',
                    details: { id: UNIT_ID },
                }),
            );
        }
    });
});
