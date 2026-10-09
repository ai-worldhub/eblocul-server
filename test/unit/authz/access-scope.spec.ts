import {
    type AccessScope,
    scopeOf,
} from '../../../src/core/authz/domain/entities/access-scope.ts';

const COMPLEX = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10';
const NODE = '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11';

describe('AccessScope', () => {
    it('keeps every root and every node once', () => {
        expect(
            scopeOf({
                complexId: COMPLEX,
                subtreeRootIds: [NODE, NODE],
                nodeIds: [COMPLEX, NODE, COMPLEX],
                withUnadministeredNodes: false,
            }),
        ).toMatchObject({
            complexId: COMPLEX,
            subtreeRootIds: [NODE],
            nodeIds: [COMPLEX, NODE],
            withUnadministeredNodes: false,
        });
    });

    it('cannot be put together outside the access module: an object with the same fields is not a scope', () => {
        const lookalike = {
            complexId: COMPLEX,
            subtreeRootIds: [NODE],
            nodeIds: [],
            withUnadministeredNodes: false,
        };

        expectTypeOf(lookalike).not.toExtend<AccessScope>();
        expectTypeOf(scopeOf(lookalike)).toExtend<AccessScope>();
    });
});
