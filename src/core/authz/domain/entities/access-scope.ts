const SCOPE: unique symbol = Symbol('AccessScope');

export type AccessScope = {
    readonly complexId: string;
    readonly subtreeRootIds: readonly string[];
    readonly nodeIds: readonly string[];
    readonly withUnadministeredNodes: boolean;
    readonly [SCOPE]: true;
};

export type ScopeParts = {
    complexId: string;
    subtreeRootIds: readonly string[];
    nodeIds: readonly string[];
    withUnadministeredNodes: boolean;
};

export const scopeOf = (parts: ScopeParts): AccessScope => ({
    complexId: parts.complexId,
    subtreeRootIds: [...new Set(parts.subtreeRootIds)],
    nodeIds: [...new Set(parts.nodeIds)],
    withUnadministeredNodes: parts.withUnadministeredNodes,
    [SCOPE]: true,
});
