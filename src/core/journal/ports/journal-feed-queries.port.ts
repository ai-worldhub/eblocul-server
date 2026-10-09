import type { CursorKey } from '../../../shared/http/pagination.ts';
import type { AccessScope } from '../../authz/index.ts';
import type { ListedEntry } from '../domain/entities/journal-entry-view.ts';

export type FeedFilter = {
    from: Date | null;
    to: Date | null;
    action: string | null;
    actorAccountId: string | null;
    before: CursorKey | null;
    take: number;
};

export abstract class JournalFeedQueries {
    abstract subtreeNodeIds(nodeId: string, take: number): Promise<string[]>;
    abstract underNode(
        scope: AccessScope,
        nodeId: string,
        filter: FeedFilter,
    ): Promise<ListedEntry[]>;
    abstract onNodes(
        scope: AccessScope,
        nodeIds: readonly string[],
        filter: FeedFilter,
    ): Promise<ListedEntry[]>;
}
