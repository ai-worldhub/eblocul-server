import { Controller, Get } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiCookieAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../../shared/http/error.dto.ts';
import { SessionOnly } from '../../../shared/http/session-only.decorator.ts';
import {
    CurrentSession,
    SESSION_COOKIE_NAME,
    type SessionContext,
} from '../../identity/index.ts';
import { GrantListService } from '../application/services/grant-list.service.ts';
import { MyAccess } from './dto/my-access.dto.ts';
import { toMyAccessResponse } from './mappers/grant.mapper.ts';

@ApiTags('access')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiBearerAuth('user-token')
@Controller('me/access')
export class MyAccessController {
    constructor(private readonly _grants: GrantListService) {}

    @Get()
    @SessionOnly()
    @ApiOperation({
        summary: 'Read the grants the current session may act by',
    })
    @ApiOkResponse({ type: MyAccess.Response })
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    async read(
        @CurrentSession() session: SessionContext,
    ): Promise<MyAccess.Response> {
        return toMyAccessResponse(session, await this._grants.listFor(session));
    }
}
