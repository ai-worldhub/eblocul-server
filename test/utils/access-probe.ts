import {
    Controller,
    Get,
    HttpCode,
    Injectable,
    Module,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import { JOURNAL_ACTIONS } from '../../src/app/journal-actions.ts';
import {
    Access,
    type AccessContext,
    type AccessScope,
    AccessService,
    AuthzModule,
    CurrentAccess,
    defineAction,
    scopeCondition,
} from '../../src/core/authz/index.ts';
import { IdentityModule } from '../../src/core/identity/index.ts';
import { JournalModule } from '../../src/core/journal/index.ts';
import { MembershipModule } from '../../src/core/membership/index.ts';
import { StructureModule } from '../../src/core/structure/index.ts';
import { Prisma } from '../../src/generated/prisma/client.ts';
import { ClockModule } from '../../src/shared/clock/clock.module.ts';
import { Clock } from '../../src/shared/clock/clock.service.ts';
import { SetupConfigModule } from '../../src/shared/configs/setup-config.module.ts';
import { DbModule } from '../../src/shared/db/db.module.ts';
import { DbService } from '../../src/shared/db/db.service.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import type { Tx } from '../../src/shared/db/tx.ts';
import { IdsModule } from '../../src/shared/ids/ids.module.ts';
import { Ids } from '../../src/shared/ids/ids.service.ts';
import {
    createProbeApp,
    type ProbeApp,
    type ProbeAppOptions,
} from './probe-app.ts';

const RESIDENTS = {
    owner: ['chain'],
    family_member: ['chain'],
    tenant: ['chain'],
} as const;

export const READ_RECORDS = defineAction({
    name: 'probe.read_records',
    kind: 'read',
    grants: {
        ...RESIDENTS,
        administrator: ['perimeter'],
        chairman: ['perimeter'],
        chief_administrator: ['quarter'],
    },
});

export const CHANGE_RECORDS = defineAction({
    name: 'probe.change_records',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['quarter_node', 'taken_zones'],
    },
});

export const READ_SETTINGS = defineAction({
    name: 'probe.read_settings',
    kind: 'read',
    grants: {
        administrator: ['perimeter', 'ancestors'],
        chairman: ['perimeter', 'ancestors'],
        chief_administrator: ['quarter'],
    },
});

const CHANGE_SETTINGS = defineAction({
    name: 'probe.change_settings',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['quarter_node', 'taken_zones'],
    },
});

export const HANDLE_REQUESTS = defineAction({
    name: 'probe.handle_requests',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['unadministered_nodes', 'taken_zones'],
    },
});

const DEACTIVATE_RESIDENT = defineAction({
    name: 'probe.deactivate_resident',
    kind: 'change',
    grants: {
        administrator: ['perimeter'],
        chief_administrator: ['quarter'],
    },
});

const ISSUE_CODE = defineAction({
    name: 'probe.issue_code',
    kind: 'change',
    grants: { owner: ['chain'] },
});

export const CREATE_TICKET = defineAction({
    name: 'probe.create_ticket',
    kind: 'change',
    grants: RESIDENTS,
});

const PROBE_ACTIONS = [
    READ_RECORDS,
    CHANGE_RECORDS,
    READ_SETTINGS,
    CHANGE_SETTINGS,
    HANDLE_REQUESTS,
    DEACTIVATE_RESIDENT,
    ISSUE_CODE,
    CREATE_TICKET,
];

export type ProbeRecord = { id: string; ownerNodeId: string; title: string };

type RecordRow = { id: string; owner_node_id: string; title: string };

const COLUMNS = {
    complexId: Prisma.sql`r.complex_id`,
    ownerNodeId: Prisma.sql`r.owner_node_id`,
};

const PAGE = 100;

export const recordsSql = (scope: AccessScope): Prisma.Sql => Prisma.sql`
    SELECT r.id, r.owner_node_id, r.title
    FROM authz_probe.records r
    WHERE ${scopeCondition(scope, COLUMNS)}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${PAGE}
`;

const SET_UP = [
    'CREATE SCHEMA IF NOT EXISTS authz_probe',
    `CREATE TABLE IF NOT EXISTS authz_probe.records (
        id uuid PRIMARY KEY,
        complex_id uuid NOT NULL REFERENCES structure.nodes (id),
        owner_node_id uuid NOT NULL REFERENCES structure.nodes (id),
        title text NOT NULL,
        created_at timestamptz(3) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS records_complex_id_created_at_id_idx
        ON authz_probe.records (complex_id, created_at, id)`,
    `CREATE INDEX IF NOT EXISTS records_complex_id_owner_node_id_idx
        ON authz_probe.records (complex_id, owner_node_id)`,
    `CREATE INDEX IF NOT EXISTS records_owner_node_id_idx
        ON authz_probe.records (owner_node_id)`,
];

const TEAR_DOWN = 'DROP SCHEMA IF EXISTS authz_probe CASCADE';

export const setUpProbeRecords = async (db: DbService): Promise<void> => {
    for (const statement of SET_UP) {
        await db.$executeRawUnsafe(statement);
    }
};

export const tearDownProbeRecords = async (db: DbService): Promise<void> => {
    await db.$executeRawUnsafe(TEAR_DOWN);
};

const recordOf = (row: RecordRow): ProbeRecord => ({
    id: row.id,
    ownerNodeId: row.owner_node_id,
    title: row.title,
});

@Injectable()
export class ProbeRecords {
    constructor(
        private readonly _db: DbService,
        private readonly _ids: Ids,
        private readonly _clock: Clock,
    ) {}

    setUp(): Promise<void> {
        return setUpProbeRecords(this._db);
    }

    tearDown(): Promise<void> {
        return tearDownProbeRecords(this._db);
    }

    async add(
        tx: Tx,
        input: { complexId: string; ownerNodeId: string; title: string },
    ): Promise<ProbeRecord> {
        const id = this._ids.next();
        await tx.$executeRaw`
            INSERT INTO authz_probe.records
                (id, complex_id, owner_node_id, title, created_at)
            VALUES (
                ${id}::uuid,
                ${input.complexId}::uuid,
                ${input.ownerNodeId}::uuid,
                ${input.title},
                ${this._clock.now()}
            )
        `;
        return { id, ownerNodeId: input.ownerNodeId, title: input.title };
    }

    async within(scope: AccessScope): Promise<ProbeRecord[]> {
        const rows = await this._db.$queryRaw<RecordRow[]>(recordsSql(scope));
        return rows.map(recordOf);
    }

    async under(scope: AccessScope, nodeId: string): Promise<ProbeRecord[]> {
        const rows = await this._db.$queryRaw<RecordRow[]>`
            SELECT r.id, r.owner_node_id, r.title
            FROM authz_probe.records r
            WHERE ${scopeCondition(scope, COLUMNS)}
              AND EXISTS (
                  SELECT 1
                  FROM structure.node_ancestors a
                  WHERE a.node_id = r.owner_node_id
                    AND a.ancestor_id = ${nodeId}::uuid
              )
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ${PAGE}
        `;
        return rows.map(recordOf);
    }
}

type Listed = { items: ProbeRecord[] };
type Done = { done: true };

const DONE: Done = { done: true };

@Controller('probe')
class AccessProbeController {
    constructor(
        private readonly _records: ProbeRecords,
        private readonly _access: AccessService,
        private readonly _transactions: Transactions,
    ) {}

    @Get('records')
    @Access(READ_RECORDS)
    async list(@CurrentAccess() access: AccessContext): Promise<Listed> {
        return { items: await this._records.within(access.scope) };
    }

    @Get('nodes/:nodeId/records')
    @Access(READ_RECORDS, { node: 'nodeId' })
    async listUnder(
        @Param('nodeId') nodeId: string,
        @CurrentAccess() access: AccessContext,
    ): Promise<Listed> {
        return { items: await this._records.under(access.scope, nodeId) };
    }

    @Post('nodes/:nodeId/records')
    @Access(CHANGE_RECORDS, { node: 'nodeId' })
    add(
        @Param('nodeId') nodeId: string,
        @CurrentAccess() access: AccessContext,
    ): Promise<ProbeRecord> {
        return this._transactions.run(async (tx) => {
            const scope = await this._access.confirm(tx, access, {
                kind: 'node',
                nodeId,
            });
            return this._records.add(tx, {
                complexId: scope.complexId,
                ownerNodeId: nodeId,
                title: `added by ${access.role}`,
            });
        });
    }

    @Get('nodes/:nodeId/settings')
    @Access(READ_SETTINGS, { node: 'nodeId' })
    readSettings(): Done {
        return DONE;
    }

    @Patch('nodes/:nodeId/settings')
    @Access(CHANGE_SETTINGS, { node: 'nodeId' })
    changeSettings(): Done {
        return DONE;
    }

    @Post('nodes/:nodeId/requests/handle')
    @HttpCode(200)
    @Access(HANDLE_REQUESTS, { node: 'nodeId' })
    async handleRequests(
        @CurrentAccess() access: AccessContext,
    ): Promise<Done> {
        await this._transactions.run((tx) => this._access.confirm(tx, access));
        return DONE;
    }

    @Post('nodes/:nodeId/tickets')
    @Access(CREATE_TICKET, { node: 'nodeId' })
    createTicket(): Done {
        return DONE;
    }

    @Get('units/:unitId')
    @Access(READ_RECORDS, { unit: 'unitId' })
    readUnit(): Done {
        return DONE;
    }

    @Post('units/:unitId/residents/deactivate')
    @HttpCode(200)
    @Access(DEACTIVATE_RESIDENT, { unit: 'unitId' })
    deactivateResident(): Done {
        return DONE;
    }

    @Post('units/:unitId/codes')
    @Access(ISSUE_CODE, { unit: 'unitId' })
    issueCode(): Done {
        return DONE;
    }
}

@Module({
    controllers: [AccessProbeController],
    providers: [ProbeRecords],
})
class AccessProbeModule {}

const ACCESS_PROBE_IMPORTS = [
    SetupConfigModule,
    DbModule,
    ClockModule,
    IdsModule,
    JournalModule.register(JOURNAL_ACTIONS),
    IdentityModule,
    StructureModule,
    MembershipModule,
];

export const createAccessProbe = (
    overrides?: ProbeAppOptions['overrides'],
): Promise<ProbeApp> =>
    createProbeApp([], {
        imports: [
            ...ACCESS_PROBE_IMPORTS,
            AuthzModule.register(PROBE_ACTIONS),
            AccessProbeModule,
        ],
        ...(overrides === undefined ? {} : { overrides }),
    });
