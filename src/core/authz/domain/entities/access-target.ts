export type AccessTarget = {
    unitId: string | null;
    nodeId: string;
    complexId: string;
    lineageIds: string[];
    isAdministered: boolean;
};

export type TargetReference =
    { kind: 'node'; nodeId: string } | { kind: 'unit'; unitId: string };
