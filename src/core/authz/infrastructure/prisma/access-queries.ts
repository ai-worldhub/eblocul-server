import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import type {
    AccessTarget,
    TargetReference,
} from '../../domain/entities/access-target.ts';
import type { Grant } from '../../domain/entities/grant.ts';
import type {
    GrantView,
    NodeKind,
    NodeReference,
    TakenZone,
    UnitType,
} from '../../domain/entities/grant-view.ts';
import {
    type AdministrationRole,
    type Application,
    isReadOnlyRole,
    type ResidentRole,
} from '../../domain/rules/access-roles.ts';
import type {
    AccessQueries,
    GrantHold,
    GrantKey,
} from '../../ports/access-queries.port.ts';

type GrantRow =
    | {
          kind: 'assignment';
          id: string;
          role: AdministrationRole;
          complex_id: string;
          node_id: string;
          unit_id: null;
          lineage_ids: string[];
          taken_zone_ids: string[];
      }
    | {
          kind: 'membership';
          id: string;
          role: ResidentRole;
          complex_id: string;
          node_id: string;
          unit_id: string;
          lineage_ids: string[];
          taken_zone_ids: string[];
      };

type TargetRow = {
    unit_id: string | null;
    node_id: string;
    complex_id: string;
    lineage_ids: string[];
    is_administered: boolean;
};

type AssignmentRow = {
    id: string;
    role: AdministrationRole | 'zone_takeover';
    started_at: Date;
    node_id: string;
    node_kind: NodeKind;
    node_name: string;
    complex_id: string;
    complex_name: string;
};

type MembershipRow = {
    id: string;
    role: ResidentRole;
    unit_id: string;
    unit_type: UnitType;
    unit_number: string;
    unit_floor: number | null;
    complex_id: string;
    complex_name: string;
    node_id: string;
    node_kind: NodeKind;
    node_name: string;
};

const TAKEOVER = 'zone_takeover';
const ADMIN_PANEL: Application = 'admin_panel';
const RESIDENT_APP: Application = 'resident_app';

export const grantSql = (key: GrantKey): Prisma.Sql => Prisma.sql`
    SELECT
        'assignment' AS kind,
        s.id,
        s.role::text AS role,
        n.complex_id,
        s.node_id,
        NULL::uuid AS unit_id,
        ARRAY(
            SELECT a.ancestor_id
            FROM structure.node_ancestors a
            WHERE a.node_id = s.node_id AND a.depth > 0
        ) AS lineage_ids,
        ARRAY(
            SELECT t.node_id
            FROM membership.node_assignments t
            JOIN structure.node_ancestors z
                ON z.node_id = t.node_id AND z.ancestor_id = s.node_id
            WHERE t.account_id = s.account_id
              AND t.role = 'zone_takeover'
              AND t.ended_at IS NULL
              AND s.role = 'chief_administrator'
        ) AS taken_zone_ids
    FROM membership.node_assignments s
    JOIN structure.nodes n ON n.id = s.node_id
    WHERE s.id = ${key.grantId}::uuid
      AND s.account_id = ${key.accountId}::uuid
      AND s.ended_at IS NULL
      AND s.role <> 'zone_takeover'
    UNION ALL
    SELECT
        'membership' AS kind,
        m.id,
        m.role::text AS role,
        u.complex_id,
        u.node_id,
        u.id AS unit_id,
        ARRAY(
            SELECT a.ancestor_id
            FROM structure.node_ancestors a
            WHERE a.node_id = u.node_id
        ) AS lineage_ids,
        ARRAY[]::uuid[] AS taken_zone_ids
    FROM membership.unit_memberships m
    JOIN structure.units u ON u.id = m.unit_id
    WHERE m.id = ${key.grantId}::uuid
      AND m.account_id = ${key.accountId}::uuid
      AND m.ended_at IS NULL
`;

const targetFacts = Prisma.sql`
    n.id AS node_id,
    n.complex_id,
    ARRAY(
        SELECT a.ancestor_id
        FROM structure.node_ancestors a
        WHERE a.node_id = n.id
    ) AS lineage_ids,
    EXISTS (
        SELECT 1
        FROM structure.node_ancestors a
        JOIN membership.node_assignments s ON s.node_id = a.ancestor_id
        WHERE a.node_id = n.id
          AND s.role = 'administrator'
          AND s.ended_at IS NULL
    ) AS is_administered
`;

export const targetSql = (reference: TargetReference): Prisma.Sql =>
    reference.kind === 'node'
        ? Prisma.sql`
              SELECT NULL::uuid AS unit_id, ${targetFacts}
              FROM structure.nodes n
              WHERE n.id = ${reference.nodeId}::uuid
          `
        : Prisma.sql`
              SELECT u.id AS unit_id, ${targetFacts}
              FROM structure.units u
              JOIN structure.nodes n ON n.id = u.node_id
              WHERE u.id = ${reference.unitId}::uuid
          `;

export const assignmentGrantsSql = (
    accountId: string,
): Prisma.Sql => Prisma.sql`
    SELECT
        s.id,
        s.role::text AS role,
        s.started_at,
        n.id AS node_id,
        n.kind::text AS node_kind,
        n.name AS node_name,
        c.id AS complex_id,
        c.name AS complex_name
    FROM membership.node_assignments s
    JOIN structure.nodes n ON n.id = s.node_id
    JOIN structure.nodes c ON c.id = n.complex_id
    WHERE s.account_id = ${accountId}::uuid
      AND s.ended_at IS NULL
    ORDER BY s.started_at, s.id
`;

export const membershipGrantsSql = (
    accountId: string,
): Prisma.Sql => Prisma.sql`
    SELECT
        m.id,
        m.role::text AS role,
        u.id AS unit_id,
        u.type::text AS unit_type,
        u.number AS unit_number,
        u.floor AS unit_floor,
        c.id AS complex_id,
        c.name AS complex_name,
        n.id AS node_id,
        n.kind::text AS node_kind,
        n.name AS node_name
    FROM membership.unit_memberships m
    JOIN structure.units u ON u.id = m.unit_id
    JOIN structure.nodes c ON c.id = u.complex_id
    JOIN structure.node_ancestors a ON a.node_id = u.node_id
    JOIN structure.nodes n ON n.id = a.ancestor_id
    WHERE m.account_id = ${accountId}::uuid
      AND m.ended_at IS NULL
    ORDER BY m.started_at, m.id, a.depth DESC
`;

const grantOfRow = (row: GrantRow, accountId: string): Grant =>
    row.kind === 'assignment'
        ? {
              kind: 'assignment',
              id: row.id,
              accountId,
              role: row.role,
              complexId: row.complex_id,
              nodeId: row.node_id,
              ancestorIds: row.lineage_ids,
              takenZoneIds: row.taken_zone_ids,
          }
        : {
              kind: 'membership',
              id: row.id,
              accountId,
              role: row.role,
              complexId: row.complex_id,
              unitId: row.unit_id,
              chainNodeIds: row.lineage_ids,
          };

const targetOfRow = (row: TargetRow): AccessTarget => ({
    unitId: row.unit_id,
    nodeId: row.node_id,
    complexId: row.complex_id,
    lineageIds: row.lineage_ids,
    isAdministered: row.is_administered,
});

const nodeOf = (row: {
    node_id: string;
    node_kind: NodeKind;
    node_name: string;
}): NodeReference => ({
    id: row.node_id,
    kind: row.node_kind,
    name: row.node_name,
});

const takenZoneOf = (row: AssignmentRow): TakenZone => ({
    id: row.node_id,
    name: row.node_name,
    takenAt: row.started_at,
});

const assignmentViews = (rows: AssignmentRow[]): GrantView[] =>
    rows.flatMap((row) =>
        row.role === TAKEOVER
            ? []
            : [
                  {
                      id: row.id,
                      role: row.role,
                      isReadOnly: isReadOnlyRole(row.role),
                      complex: { id: row.complex_id, name: row.complex_name },
                      node: nodeOf(row),
                      takenZones:
                          row.role === 'chief_administrator'
                              ? rows
                                    .filter(
                                        (other) =>
                                            other.role === TAKEOVER &&
                                            other.complex_id === row.node_id,
                                    )
                                    .map(takenZoneOf)
                              : [],
                      unit: null,
                      chain: [],
                  },
              ],
    );

const membershipViews = (rows: MembershipRow[]): GrantView[] => {
    const views = new Map<string, GrantView>();
    for (const row of rows) {
        const view = views.get(row.id) ?? {
            id: row.id,
            role: row.role,
            isReadOnly: false,
            complex: { id: row.complex_id, name: row.complex_name },
            node: null,
            takenZones: [],
            unit: {
                id: row.unit_id,
                type: row.unit_type,
                number: row.unit_number,
                floor: row.unit_floor,
            },
            chain: [],
        };
        view.chain.push(nodeOf(row));
        views.set(row.id, view);
    }
    return [...views.values()];
};

@Injectable()
export class PrismaAccessQueries implements AccessQueries {
    async grantOf(tx: Tx, key: GrantKey): Promise<Grant | null> {
        const rows = await tx.$queryRaw<GrantRow[]>(grantSql(key));
        const row = rows[0];
        return row === undefined ? null : grantOfRow(row, key.accountId);
    }

    async holdGrant(tx: Tx, hold: GrantHold): Promise<void> {
        if (hold.isMembership) {
            await tx.$queryRaw`
                SELECT m.id
                FROM membership.unit_memberships m
                WHERE m.id = ${hold.grantId}::uuid
                  AND m.account_id = ${hold.accountId}::uuid
                  AND m.ended_at IS NULL
                FOR SHARE OF m
            `;
            return;
        }
        await tx.$queryRaw`
            SELECT s.id
            FROM membership.node_assignments s
            WHERE s.account_id = ${hold.accountId}::uuid
              AND s.ended_at IS NULL
              AND (
                  s.id = ${hold.grantId}::uuid
                  OR (${hold.withTakeovers} AND s.role = 'zone_takeover')
              )
            FOR SHARE OF s
        `;
    }

    async targetOf(
        tx: Tx,
        reference: TargetReference,
    ): Promise<AccessTarget | null> {
        const rows = await tx.$queryRaw<TargetRow[]>(targetSql(reference));
        const row = rows[0];
        return row === undefined ? null : targetOfRow(row);
    }

    async grantsOf(
        tx: Tx,
        accountId: string,
        application: Application,
    ): Promise<GrantView[]> {
        if (application === ADMIN_PANEL) {
            return assignmentViews(
                await tx.$queryRaw<AssignmentRow[]>(
                    assignmentGrantsSql(accountId),
                ),
            );
        }
        if (application === RESIDENT_APP) {
            return membershipViews(
                await tx.$queryRaw<MembershipRow[]>(
                    membershipGrantsSql(accountId),
                ),
            );
        }
        return [];
    }
}
