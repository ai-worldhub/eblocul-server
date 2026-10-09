import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Query,
    type Type,
} from '@nestjs/common';
import {
    ApiCookieAuth,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    Access,
    type AccessContext,
    CurrentAccess,
} from '../../authz/index.ts';
import { SESSION_COOKIE_NAME } from '../../identity/index.ts';
import { JOURNAL_READ_ENTRIES } from '../application/journal.actions.ts';
import { JournalFeedService } from '../application/services/journal-feed.service.ts';
import type { JournalAction } from '../domain/rules/journal-action.ts';
import { JournalEntry } from './dto/journal-entry.dto.ts';
import { toJournalListResponse } from './mappers/journal-entry.mapper.ts';

export const journalFeedControllerFor = (
    actions: readonly JournalAction[],
): Type<unknown> => {
    @ApiTags('journal')
    @ApiCookieAuth(SESSION_COOKIE_NAME)
    @Controller('nodes')
    class JournalFeedController {
        constructor(private readonly _feed: JournalFeedService) {}

        @Get(':nodeId/journal-entries')
        @Access(JOURNAL_READ_ENTRIES, { node: 'nodeId' })
        @ApiOperation({
            summary:
                'List the action journal of a node and of everything below it',
        })
        @ApiQuery({
            name: 'action',
            required: false,
            enum: actions.map((action) => action.name),
        })
        @ApiOkResponse({ type: JournalEntry.ListResponse })
        async list(
            @CurrentAccess() access: AccessContext,
            @Param('nodeId', ParseUUIDPipe) nodeId: string,
            @Query() query: JournalEntry.ListQuery,
        ): Promise<JournalEntry.ListResponse> {
            return toJournalListResponse(
                await this._feed.list(access, nodeId, query),
            );
        }
    }

    return JournalFeedController;
};
