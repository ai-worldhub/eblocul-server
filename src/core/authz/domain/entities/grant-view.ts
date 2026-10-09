import type { AccessRole } from '../rules/access-roles.ts';

export type NodeKind = 'quarter' | 'zone' | 'building' | 'line' | 'entrance';

export type UnitType = 'apartment' | 'townhouse' | 'house' | 'duplex';

export type NodeReference = {
    id: string;
    kind: NodeKind;
    name: string;
};

export type ComplexReference = {
    id: string;
    name: string;
};

export type TakenZone = {
    id: string;
    name: string;
    takenAt: Date;
};

export type UnitReference = {
    id: string;
    type: UnitType;
    number: string;
    floor: number | null;
};

export type GrantView = {
    id: string;
    role: AccessRole;
    isReadOnly: boolean;
    complex: ComplexReference;
    node: NodeReference | null;
    takenZones: TakenZone[];
    unit: UnitReference | null;
    chain: NodeReference[];
};
