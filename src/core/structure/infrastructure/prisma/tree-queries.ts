import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import { DbService } from '../../../../shared/db/db.service.ts';
import type { NodeSnapshot } from '../../domain/entities/node.entity.ts';
import type { Subtree, UnitChain } from '../../domain/entities/tree.ts';
import type { UnitSnapshot } from '../../domain/entities/unit.entity.ts';
import type { NodeKind } from '../../domain/rules/node-levels.ts';
import type { UnitType } from '../../domain/rules/unit-placement.ts';
import type { TreeQueries } from '../../ports/tree-queries.port.ts';

type ChainRow = {
    unit_id: string;
    unit_type: UnitType;
    unit_number: string;
    unit_floor: number | null;
    unit_created_at: Date;
    node_id: string;
    complex_id: string;
    node_kind: NodeKind;
    node_name: string;
    node_address: string | null;
    node_created_at: Date;
};

type SubtreeNodeRow = {
    row_kind: 'node';
    id: string;
    complex_id: string;
    parent_id: string | null;
    node_kind: NodeKind;
    name: string;
    address: string | null;
    created_at: Date;
};

type SubtreeUnitRow = {
    row_kind: 'unit';
    id: string;
    complex_id: string;
    parent_id: string;
    unit_type: UnitType;
    number: string;
    floor: number | null;
    created_at: Date;
};

type SubtreeRow = SubtreeNodeRow | SubtreeUnitRow;

export const chainOfUnitSql = (unitId: string): Prisma.Sql => Prisma.sql`
    SELECT
        u.id AS unit_id,
        u.type::text AS unit_type,
        u.number AS unit_number,
        u.floor AS unit_floor,
        u.created_at AS unit_created_at,
        n.id AS node_id,
        n.complex_id,
        n.kind::text AS node_kind,
        n.name AS node_name,
        n.address AS node_address,
        n.created_at AS node_created_at
    FROM structure.units u
    JOIN structure.node_ancestors a ON a.node_id = u.node_id
    JOIN structure.nodes n ON n.id = a.ancestor_id
    WHERE u.id = ${unitId}::uuid
    ORDER BY a.depth DESC
`;

export const subtreeSql = (nodeId: string): Prisma.Sql => Prisma.sql`
    SELECT
        'node' AS row_kind,
        n.id,
        n.complex_id,
        parent.ancestor_id AS parent_id,
        a.depth,
        n.kind::text AS node_kind,
        NULL::text AS unit_type,
        n.name,
        n.address,
        NULL::text AS number,
        NULL::integer AS floor,
        n.created_at
    FROM structure.node_ancestors a
    JOIN structure.nodes n ON n.id = a.node_id
    LEFT JOIN structure.node_ancestors parent
        ON parent.node_id = n.id AND parent.depth = 1
    WHERE a.ancestor_id = ${nodeId}::uuid
    UNION ALL
    SELECT
        'unit' AS row_kind,
        u.id,
        u.complex_id,
        u.node_id AS parent_id,
        a.depth + 1 AS depth,
        NULL::text AS node_kind,
        u.type::text AS unit_type,
        NULL::text AS name,
        NULL::text AS address,
        u.number,
        u.floor,
        u.created_at
    FROM structure.node_ancestors a
    JOIN structure.units u ON u.node_id = a.node_id
    WHERE a.ancestor_id = ${nodeId}::uuid
    ORDER BY row_kind, depth, id
`;

const chainNodeOf = (row: ChainRow, parentId: string | null): NodeSnapshot => ({
    id: row.node_id,
    complexId: row.complex_id,
    parentId,
    kind: row.node_kind,
    name: row.node_name,
    address: row.node_address,
    createdAt: row.node_created_at,
});

const chainUnitOf = (row: ChainRow, nodeId: string): UnitSnapshot => ({
    id: row.unit_id,
    complexId: row.complex_id,
    nodeId,
    type: row.unit_type,
    number: row.unit_number,
    floor: row.unit_floor,
    createdAt: row.unit_created_at,
});

const subtreeNodeOf = (row: SubtreeNodeRow): NodeSnapshot => ({
    id: row.id,
    complexId: row.complex_id,
    parentId: row.parent_id,
    kind: row.node_kind,
    name: row.name,
    address: row.address,
    createdAt: row.created_at,
});

const subtreeUnitOf = (row: SubtreeUnitRow): UnitSnapshot => ({
    id: row.id,
    complexId: row.complex_id,
    nodeId: row.parent_id,
    type: row.unit_type,
    number: row.number,
    floor: row.floor,
    createdAt: row.created_at,
});

@Injectable()
export class PrismaTreeQueries implements TreeQueries {
    constructor(private readonly _db: DbService) {}

    async chainOfUnit(unitId: string): Promise<UnitChain | null> {
        const rows = await this._db.$queryRaw<ChainRow[]>(
            chainOfUnitSql(unitId),
        );
        const last = rows.at(-1);
        if (last === undefined) {
            return null;
        }
        return {
            nodes: rows.map((row, index) =>
                chainNodeOf(row, rows[index - 1]?.node_id ?? null),
            ),
            unit: chainUnitOf(last, last.node_id),
        };
    }

    async subtreeOf(nodeId: string): Promise<Subtree | null> {
        const rows = await this._db.$queryRaw<SubtreeRow[]>(subtreeSql(nodeId));
        if (rows.length === 0) {
            return null;
        }
        return {
            nodes: rows
                .filter((row) => row.row_kind === 'node')
                .map(subtreeNodeOf),
            units: rows
                .filter((row) => row.row_kind === 'unit')
                .map(subtreeUnitOf),
        };
    }
}
