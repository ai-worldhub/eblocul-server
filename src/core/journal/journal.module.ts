import { type DynamicModule, Module } from '@nestjs/common';
import { REGISTERED_JOURNAL_ACTIONS } from './application/registered-actions.ts';
import { JournalService } from './application/services/journal.service.ts';
import {
    assertDistinctActions,
    type JournalAction,
} from './domain/rules/journal-action.ts';
import { PrismaJournalEntryRepository } from './infrastructure/prisma/journal-entry.repository.ts';
import { JournalEntryRepository } from './ports/journal-entry.repository.ts';

@Module({})
export class JournalModule {
    static register(actions: readonly JournalAction[]): DynamicModule {
        assertDistinctActions(actions);
        return {
            module: JournalModule,
            global: true,
            providers: [
                JournalService,
                { provide: REGISTERED_JOURNAL_ACTIONS, useValue: actions },
                {
                    provide: JournalEntryRepository,
                    useClass: PrismaJournalEntryRepository,
                },
            ],
            exports: [JournalService, REGISTERED_JOURNAL_ACTIONS],
        };
    }
}
