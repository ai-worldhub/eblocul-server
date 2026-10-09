import { Module } from '@nestjs/common';
import { JournalService } from './application/services/journal.service.ts';
import { PrismaJournalEntryRepository } from './infrastructure/prisma/journal-entry.repository.ts';
import { JournalEntryRepository } from './ports/journal-entry.repository.ts';

@Module({
    providers: [
        JournalService,
        {
            provide: JournalEntryRepository,
            useClass: PrismaJournalEntryRepository,
        },
    ],
    exports: [JournalService],
})
export class JournalModule {}
