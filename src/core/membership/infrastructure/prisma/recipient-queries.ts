import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import type { NodeAssignmentSnapshot } from '../../domain/entities/node-assignment.entity.ts';
import type { RecipientRole } from '../../domain/rules/request-recipients.ts';
import type { RecipientQueries } from '../../ports/recipient-queries.port.ts';

type ResponsibleRow = {
    id: string | null;
    account_id: string | null;
    node_id: string | null;
    role: RecipientRole | null;
    started_at: Date | null;
};

export const responsibleForSql = (nodeId: string): Prisma.Sql => Prisma.sql`
    SELECT
        s.id,
        s.account_id,
        s.node_id,
        s.role::text AS role,
        s.started_at
    FROM structure.node_ancestors a
    LEFT JOIN membership.node_assignments s
        ON s.node_id = a.ancestor_id
       AND s.ended_at IS NULL
       AND s.role IN ('administrator', 'chief_administrator')
    WHERE a.node_id = ${nodeId}::uuid
    ORDER BY a.depth, s.started_at, s.id
`;

const assignmentOf = (row: ResponsibleRow): NodeAssignmentSnapshot[] =>
    row.id === null ||
    row.account_id === null ||
    row.node_id === null ||
    row.role === null ||
    row.started_at === null
        ? []
        : [
              {
                  id: row.id,
                  accountId: row.account_id,
                  nodeId: row.node_id,
                  role: row.role,
                  startedAt: row.started_at,
                  endedAt: null,
              },
          ];

@Injectable()
export class PrismaRecipientQueries implements RecipientQueries {
    async responsibleFor(
        tx: Tx,
        nodeId: string,
    ): Promise<NodeAssignmentSnapshot[] | null> {
        const rows = await tx.$queryRaw<ResponsibleRow[]>(
            responsibleForSql(nodeId),
        );
        return rows.length === 0 ? null : rows.flatMap(assignmentOf);
    }
}
