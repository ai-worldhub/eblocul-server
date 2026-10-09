import { Injectable } from '@nestjs/common';
import { DbService } from '../../../../shared/db/db.service.ts';
import type { SessionContext } from '../../../identity/index.ts';
import type { GrantView } from '../../domain/entities/grant-view.ts';
import { AccessQueries } from '../../ports/access-queries.port.ts';

@Injectable()
export class GrantListService {
    constructor(
        private readonly _queries: AccessQueries,
        private readonly _db: DbService,
    ) {}

    listFor(session: SessionContext): Promise<GrantView[]> {
        return this._queries.grantsOf(
            this._db,
            session.accountId,
            session.application,
        );
    }
}
