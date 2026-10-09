import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import {
    type AccessScope,
    scopeCondition,
    type ScopeColumns,
} from '../../../authz/index.ts';
import type {
    NodeKind as StructureNodeKind,
    UnitType as StructureUnitType,
} from '../../../structure/index.ts';
import type {
    ActorKind,
    ActorRole,
} from '../../domain/entities/journal-entry.ts';
import type {
    ListedEntry,
    NodeKind,
    UnitType,
} from '../../domain/entities/journal-entry-view.ts';
import type { Details } from '../../domain/rules/journal-action.ts';
import type {
    FeedFilter,
    JournalFeedQueries,
} from '../../ports/journal-feed-queries.port.ts';

type Same<Ours, Theirs> = [Ours] extends [Theirs]
    ? [Theirs] extends [Ours]
        ? true
        : false
    : false;

true satisfies Same<NodeKind, StructureNodeKind>;
true satisfies Same<UnitType, StructureUnitType>;

type EntryRow = {
    id: string;
    created_at: Date;
    action: string;
    actor_kind: ActorKind;
    actor_account_id: string | null;
    actor_role: ActorRole | null;
    subject_account_id: string | null;
    details: Details;
    node_id: string;
    node_kind: NodeKind;
    node_name: string;
    unit_id: string | null;
    unit_type: UnitType | null;
    unit_number: string | null;
};

type NodeRow = { node_id: string };

const COLUMNS: ScopeColumns = {
    complexId: Prisma.sql`e.complex_id`,
    ownerNodeId: Prisma.sql`e.owner_node_id`,
};

const ENTRY = Prisma.sql`
    e.id,
    e.created_at,
    e.owner_node_id,
    e.subject_unit_id,
    e.action,
    e.actor_kind,
    e.actor_account_id,
    e.actor_role,
    e.subject_account_id,
    e.details
`;

const filterSql = (filter: FeedFilter): Prisma.Sql =>
    Prisma.join(
        [
            Prisma.sql`TRUE`,
            ...(filter.from === null
                ? []
                : [Prisma.sql`e.created_at >= ${filter.from}::timestamptz`]),
            ...(filter.to === null
                ? []
                : [Prisma.sql`e.created_at < ${filter.to}::timestamptz`]),
            ...(filter.action === null
                ? []
                : [Prisma.sql`e.action = ${filter.action}`]),
            ...(filter.actorAccountId === null
                ? []
                : [
                      Prisma.sql`e.actor_account_id = ${filter.actorAccountId}::uuid`,
                  ]),
            ...(filter.before === null
                ? []
                : [
                      Prisma.sql`(e.created_at, e.id) < (${filter.before.createdAt}::timestamptz, ${filter.before.id}::uuid)`,
                  ]),
        ],
        ' AND ',
    );

export const subtreeNodeIdsSql = (
    nodeId: string,
    take: number,
): Prisma.Sql => Prisma.sql`
    SELECT a.node_id
    FROM structure.node_ancestors a
    WHERE a.ancestor_id = ${nodeId}::uuid
    LIMIT ${take}
`;

export const entriesUnderNodeSql = (
    scope: AccessScope,
    nodeId: string,
    filter: FeedFilter,
): Prisma.Sql => Prisma.sql`
    SELECT ${ENTRY}
    FROM journal.entries e
    WHERE ${scopeCondition(scope, COLUMNS)}
      AND EXISTS (
          SELECT 1
          FROM structure.node_ancestors under
          WHERE under.node_id = e.owner_node_id
            AND under.ancestor_id = ${nodeId}::uuid
      )
      AND ${filterSql(filter)}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ${filter.take}
`;

export const entriesOnNodesSql = (
    scope: AccessScope,
    nodeIds: readonly string[],
    filter: FeedFilter,
): Prisma.Sql => Prisma.sql`
    SELECT e.*
    FROM unnest(${[...nodeIds]}::uuid[]) AS owner (id)
    CROSS JOIN LATERAL (
        SELECT ${ENTRY}
        FROM journal.entries e
        WHERE e.owner_node_id = owner.id
          AND ${scopeCondition(scope, COLUMNS)}
          AND ${filterSql(filter)}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT ${filter.take}
    ) e
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ${filter.take}
`;

export const feedSql = (page: Prisma.Sql): Prisma.Sql => Prisma.sql`
    SELECT
        p.id,
        p.created_at,
        p.action,
        p.actor_kind::text AS actor_kind,
        p.actor_account_id,
        p.actor_role::text AS actor_role,
        p.subject_account_id,
        p.details,
        n.id AS node_id,
        n.kind::text AS node_kind,
        n.name AS node_name,
        u.id AS unit_id,
        u.type::text AS unit_type,
        u.number AS unit_number
    FROM (${page}) p
    JOIN structure.nodes n ON n.id = p.owner_node_id
    LEFT JOIN structure.units u ON u.id = p.subject_unit_id
    ORDER BY p.created_at DESC, p.id DESC
`;

const entryOf = (row: EntryRow): ListedEntry => ({
    id: row.id,
    createdAt: row.created_at,
    action: row.action,
    actorKind: row.actor_kind,
    actorAccountId: row.actor_account_id,
    actorRole: row.actor_role,
    node: { id: row.node_id, kind: row.node_kind, name: row.node_name },
    subjectAccountId: row.subject_account_id,
    subjectUnit:
        row.unit_id === null ||
        row.unit_type === null ||
        row.unit_number === null
            ? null
            : { id: row.unit_id, type: row.unit_type, number: row.unit_number },
    details: row.details,
});

@Injectable()
export class PrismaJournalFeedQueries implements JournalFeedQueries {
    constructor(private readonly _db: DbService) {}

    async subtreeNodeIds(nodeId: string, take: number): Promise<string[]> {
        const rows = await this._db.$queryRaw<NodeRow[]>(
            subtreeNodeIdsSql(nodeId, take),
        );
        return rows.map((row) => row.node_id);
    }

    async underNode(
        scope: AccessScope,
        nodeId: string,
        filter: FeedFilter,
    ): Promise<ListedEntry[]> {
        const rows = await this._db.$queryRaw<EntryRow[]>(
            feedSql(entriesUnderNodeSql(scope, nodeId, filter)),
        );
        return rows.map(entryOf);
    }

    async onNodes(
        scope: AccessScope,
        nodeIds: readonly string[],
        filter: FeedFilter,
    ): Promise<ListedEntry[]> {
        if (nodeIds.length === 0) {
            return [];
        }
        const rows = await this._db.$queryRaw<EntryRow[]>(
            feedSql(entriesOnNodesSql(scope, nodeIds, filter)),
        );
        return rows.map(entryOf);
    }
}
