import { Prisma } from '../../src/generated/prisma/client.ts';
import type { DbService } from '../../src/shared/db/db.service.ts';
import type { Tx } from '../../src/shared/db/tx.ts';

type PlanNode = {
    'Node Type': string;
    'Relation Name'?: string;
    'Actual Rows'?: number;
    'Actual Loops'?: number;
    'Rows Removed by Filter'?: number;
    Plans?: PlanNode[];
};

type Explained = { 'QUERY PLAN': { Plan: PlanNode }[] };

export type TableScan = {
    table: string;
    method: string;
    rowsRead: number;
};

const SEQUENTIAL_SCAN = 'Seq Scan';

const scansIn = (node: PlanNode): TableScan[] => {
    const table = node['Relation Name'];
    const rowsPerLoop =
        (node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0);
    const own =
        table === undefined
            ? []
            : [
                  {
                      table,
                      method: node['Node Type'],
                      rowsRead: Math.round(
                          rowsPerLoop * (node['Actual Loops'] ?? 1),
                      ),
                  },
              ];
    return [...own, ...(node.Plans ?? []).flatMap(scansIn)];
};

export const tableScansOf = async (
    db: DbService | Tx,
    query: Prisma.Sql,
): Promise<TableScan[]> => {
    const explained = await db.$queryRaw<Explained[]>(
        Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`,
    );
    const plan = explained[0]?.['QUERY PLAN'][0]?.Plan;
    if (plan === undefined) {
        throw new Error('EXPLAIN returned no plan');
    }
    return scansIn(plan);
};

export const sequentiallyScanned = (scans: TableScan[]): string[] => [
    ...new Set(
        scans
            .filter((scan) => scan.method === SEQUENTIAL_SCAN)
            .map((scan) => scan.table),
    ),
];

export const rowsReadFrom = (scans: TableScan[], table: string): number =>
    scans
        .filter((scan) => scan.table === table)
        .reduce((total, scan) => total + scan.rowsRead, 0);
