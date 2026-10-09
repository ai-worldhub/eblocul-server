import { type DynamicModule, Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.ts';
import { JournalFeedService } from './application/services/journal-feed.service.ts';
import type { JournalAction } from './domain/rules/journal-action.ts';
import { PrismaJournalFeedQueries } from './infrastructure/prisma/journal-feed-queries.ts';
import { JournalModule } from './journal.module.ts';
import { JournalFeedQueries } from './ports/journal-feed-queries.port.ts';
import { journalFeedControllerFor } from './presentation/journal-feed.controller.ts';

@Module({})
export class JournalFeedModule {
    static register(actions: readonly JournalAction[]): DynamicModule {
        return {
            module: JournalFeedModule,
            imports: [IdentityModule, JournalModule.register(actions)],
            controllers: [journalFeedControllerFor(actions)],
            providers: [
                JournalFeedService,
                {
                    provide: JournalFeedQueries,
                    useClass: PrismaJournalFeedQueries,
                },
            ],
        };
    }
}
