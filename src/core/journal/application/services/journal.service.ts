import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import {
    journalEntryOf,
    type JournalRecord,
} from '../../domain/entities/journal-entry.ts';
import { JournalError } from '../../domain/journal.errors.ts';
import {
    assertRegistered,
    type DetailShape,
    type JournalAction,
} from '../../domain/rules/journal-action.ts';
import { JournalEntryRepository } from '../../ports/journal-entry.repository.ts';
import { REGISTERED_JOURNAL_ACTIONS } from '../registered-actions.ts';

@Injectable()
export class JournalService {
    constructor(
        private readonly _entries: JournalEntryRepository,
        @Inject(REGISTERED_JOURNAL_ACTIONS)
        private readonly _actions: readonly JournalAction[],
        private readonly _clock: Clock,
        private readonly _ids: Ids,
    ) {}

    async record<Shape extends DetailShape>(
        tx: Tx,
        action: JournalAction<Shape>,
        record: JournalRecord<Shape>,
    ): Promise<void> {
        assertRegistered(this._actions, action);
        const entry = journalEntryOf(action, record, {
            id: this._ids.next(),
            now: this._clock.now(),
        });
        if (!(await this._entries.append(tx, entry))) {
            throw new JournalError(
                'JOURNAL_NODE_NOT_FOUND',
                'The node of the journal entry is not found',
                { action: action.name, nodeId: entry.nodeId },
            );
        }
    }
}
