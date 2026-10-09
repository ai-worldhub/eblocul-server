import { Inject, Injectable } from '@nestjs/common';
import {
    type CursorPage,
    decodeUuidCursor,
    DEFAULT_LIMIT,
    toCursorPage,
} from '../../../../shared/http/pagination.ts';
import type { AccessContext } from '../../../authz/index.ts';
import { AccountService } from '../../../identity/index.ts';
import {
    accountIdsOf,
    type JournalEntryView,
    namedEntryOf,
} from '../../domain/entities/journal-entry-view.ts';
import {
    isSmallSubtree,
    knownActionOf,
    periodOf,
    SMALL_SUBTREE_NODES,
} from '../../domain/rules/feed.ts';
import type { JournalAction } from '../../domain/rules/journal-action.ts';
import {
    type FeedFilter,
    JournalFeedQueries,
} from '../../ports/journal-feed-queries.port.ts';
import { REGISTERED_JOURNAL_ACTIONS } from '../registered-actions.ts';

export type FeedRequest = {
    limit?: number;
    cursor?: string;
    from?: string;
    to?: string;
    action?: string;
    actorAccountId?: string;
};

@Injectable()
export class JournalFeedService {
    constructor(
        private readonly _queries: JournalFeedQueries,
        private readonly _accounts: AccountService,
        @Inject(REGISTERED_JOURNAL_ACTIONS)
        private readonly _actions: readonly JournalAction[],
    ) {}

    async list(
        access: AccessContext,
        nodeId: string,
        request: FeedRequest,
    ): Promise<CursorPage<JournalEntryView>> {
        const limit = request.limit ?? DEFAULT_LIMIT;
        const filter: FeedFilter = {
            ...periodOf(request.from, request.to),
            action: knownActionOf(
                this._actions.map((action) => action.name),
                request.action,
            ),
            actorAccountId: request.actorAccountId ?? null,
            before:
                request.cursor === undefined
                    ? null
                    : decodeUuidCursor(request.cursor),
            take: limit + 1,
        };
        const nodeIds = await this._queries.subtreeNodeIds(
            nodeId,
            SMALL_SUBTREE_NODES + 1,
        );
        const entries = isSmallSubtree(nodeIds.length)
            ? await this._queries.onNodes(access.scope, nodeIds, filter)
            : await this._queries.underNode(access.scope, nodeId, filter);
        const page = toCursorPage(entries, limit);
        const names = await this._accounts.findNames(accountIdsOf(page.items));
        return {
            items: page.items.map((entry) => namedEntryOf(entry, names)),
            nextCursor: page.nextCursor,
        };
    }
}
