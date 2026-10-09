import { Prisma } from '../../../../generated/prisma/client.ts';
import type { AccessScope } from '../../domain/entities/access-scope.ts';

export type ScopeColumns = {
    complexId: Prisma.Sql;
    ownerNodeId: Prisma.Sql;
};

export type ScopeWhere = {
    complexId: string;
    ownerNode: Prisma.NodeWhereInput;
};

const NOWHERE = Prisma.sql`FALSE`;

const branchesOf = (
    scope: AccessScope,
    ownerNodeId: Prisma.Sql,
): Prisma.Sql[] => [
    ...(scope.nodeIds.length === 0
        ? []
        : [Prisma.sql`${ownerNodeId} = ANY(${[...scope.nodeIds]}::uuid[])`]),
    ...(scope.subtreeRootIds.length === 0
        ? []
        : [
              Prisma.sql`EXISTS (
                  SELECT 1
                  FROM structure.node_ancestors scope_a
                  WHERE scope_a.node_id = ${ownerNodeId}
                    AND scope_a.ancestor_id = ANY(${[...scope.subtreeRootIds]}::uuid[])
              )`,
          ]),
    ...(scope.withUnadministeredNodes
        ? [
              Prisma.sql`NOT EXISTS (
                  SELECT 1
                  FROM structure.node_ancestors scope_u
                  JOIN membership.node_assignments scope_s
                      ON scope_s.node_id = scope_u.ancestor_id
                  WHERE scope_u.node_id = ${ownerNodeId}
                    AND scope_s.role = 'administrator'
                    AND scope_s.ended_at IS NULL
              )`,
          ]
        : []),
];

export const scopeCondition = (
    scope: AccessScope,
    columns: ScopeColumns,
): Prisma.Sql => {
    const branches = branchesOf(scope, columns.ownerNodeId);
    return Prisma.sql`(
        ${columns.complexId} = ${scope.complexId}::uuid
        AND (${branches.length === 0 ? NOWHERE : Prisma.join(branches, ' OR ')})
    )`;
};

export const scopeNodeWhere = (scope: AccessScope): Prisma.NodeWhereInput => ({
    complexId: scope.complexId,
    OR: [
        { id: { in: [...scope.nodeIds] } },
        {
            ancestors: {
                some: { ancestorId: { in: [...scope.subtreeRootIds] } },
            },
        },
        ...(scope.withUnadministeredNodes
            ? [
                  {
                      ancestors: {
                          none: {
                              ancestor: {
                                  assignments: {
                                      some: {
                                          role: 'administrator' as const,
                                          endedAt: null,
                                      },
                                  },
                              },
                          },
                      },
                  },
              ]
            : []),
    ],
});

export const scopeWhere = (scope: AccessScope): ScopeWhere => ({
    complexId: scope.complexId,
    ownerNode: scopeNodeWhere(scope),
});
