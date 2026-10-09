import { type DynamicModule, Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.ts';
import { REGISTERED_JOURNAL_ACTIONS } from './application/registered-actions.ts';
import { JournalFeedService } from './application/services/journal-feed.service.ts';
import {
    assertDistinctActions,
    type JournalAction,
} from './domain/rules/journal-action.ts';
import { PrismaJournalFeedQueries } from './infrastructure/prisma/journal-feed-queries.ts';
import { JournalFeedQueries } from './ports/journal-feed-queries.port.ts';
import { journalFeedControllerFor } from './presentation/journal-feed.controller.ts';

@Module({})
export class JournalFeedModule {
    static register(actions: readonly JournalAction[]): DynamicModule {
        assertDistinctActions(actions);
        return {
            module: JournalFeedModule,
            imports: [IdentityModule],
            controllers: [journalFeedControllerFor(actions)],
            providers: [
                JournalFeedService,
                { provide: REGISTERED_JOURNAL_ACTIONS, useValue: actions },
                {
                    provide: JournalFeedQueries,
                    useClass: PrismaJournalFeedQueries,
                },
            ],
        };
    }
}
