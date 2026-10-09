import {
    actionForbidden,
    grantNotActive,
    targetNotFound,
} from '../authz.errors.ts';
import type { AccessTarget } from '../entities/access-target.ts';
import { type AccessScope, scopeOf } from '../entities/access-scope.ts';
import type { Grant } from '../entities/grant.ts';
import {
    type AccessAction,
    type Coverage,
    coverageOf,
} from './access-action.ts';
import {
    type AccessRole,
    type Application,
    applicationOf,
} from './access-roles.ts';

const VISIBLE: Record<AccessRole, readonly Coverage[]> = {
    owner: ['chain'],
    family_member: ['chain'],
    tenant: ['chain'],
    administrator: ['perimeter', 'ancestors'],
    chairman: ['perimeter', 'ancestors'],
    chief_administrator: ['quarter'],
};

type Reach = { subtreeRootIds: string[]; nodeIds: string[]; isOpen: boolean };

const NOTHING: Reach = { subtreeRootIds: [], nodeIds: [], isOpen: false };

const reachOf = (grant: Grant, coverage: Coverage): Reach => {
    if (grant.kind === 'membership') {
        return coverage === 'chain'
            ? { ...NOTHING, nodeIds: grant.chainNodeIds }
            : NOTHING;
    }
    switch (coverage) {
        case 'perimeter':
        case 'quarter':
            return { ...NOTHING, subtreeRootIds: [grant.nodeId] };
        case 'ancestors':
            return { ...NOTHING, nodeIds: grant.ancestorIds };
        case 'quarter_node':
            return { ...NOTHING, nodeIds: [grant.nodeId] };
        case 'taken_zones':
            return { ...NOTHING, subtreeRootIds: grant.takenZoneIds };
        case 'unadministered_nodes':
            return { ...NOTHING, isOpen: true };
        default:
            return NOTHING;
    }
};

const scopeFor = (
    grant: Grant,
    coverages: readonly Coverage[],
): AccessScope => {
    const reaches = coverages.map((coverage) => reachOf(grant, coverage));
    return scopeOf({
        complexId: grant.complexId,
        subtreeRootIds: reaches.flatMap((reach) => reach.subtreeRootIds),
        nodeIds: reaches.flatMap((reach) => reach.nodeIds),
        withUnadministeredNodes: reaches.some((reach) => reach.isOpen),
    });
};

const covers = (
    grant: Grant,
    scope: AccessScope,
    target: AccessTarget,
): boolean => {
    if (target.complexId !== scope.complexId) {
        return false;
    }
    if (
        grant.kind === 'membership' &&
        target.unitId !== null &&
        target.unitId !== grant.unitId
    ) {
        return false;
    }
    return (
        scope.nodeIds.includes(target.nodeId) ||
        target.lineageIds.some((id) => scope.subtreeRootIds.includes(id)) ||
        (scope.withUnadministeredNodes && !target.isAdministered)
    );
};

export type AccessQuestion = {
    grant: Grant | null;
    application: Application;
    action: AccessAction;
    target?: AccessTarget | null;
};

export type AccessDecision = {
    grant: Grant;
    scope: AccessScope;
};

export const decide = (question: AccessQuestion): AccessDecision => {
    const { grant, application, action, target } = question;
    if (grant === null || applicationOf(grant.role) !== application) {
        throw grantNotActive();
    }
    if (target !== undefined) {
        const visible = scopeFor(grant, VISIBLE[grant.role]);
        if (target === null || !covers(grant, visible, target)) {
            throw targetNotFound();
        }
    }
    const coverages = coverageOf(action, grant.role);
    if (coverages.length === 0) {
        throw actionForbidden(action.name);
    }
    const scope = scopeFor(grant, coverages);
    if (target !== undefined && target !== null) {
        if (!covers(grant, scope, target)) {
            throw actionForbidden(action.name);
        }
    }
    return { grant, scope };
};

export const reliesOnTakeovers = (
    action: AccessAction,
    role: AccessRole,
): boolean => coverageOf(action, role).includes('taken_zones');

export const isResidentRole = (role: AccessRole): boolean =>
    applicationOf(role) === 'resident_app';
