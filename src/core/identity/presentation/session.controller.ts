import { Controller, Delete, Get, HttpCode, Req, Res } from '@nestjs/common';
import {
    ApiCookieAuth,
    ApiForbiddenResponse,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { ErrorResponse } from '../../../shared/http/error.dto.ts';
import { Public } from '../../../shared/http/public.decorator.ts';
import { SessionService } from '../application/services/session.service.ts';
import type { SessionContext } from '../domain/entities/session.entity.ts';
import { CurrentSession } from './decorators/current-session.decorator.ts';
import { Session } from './dto/session.dto.ts';
import { presentedSessionOf } from './guard/presented-session.ts';
import {
    type CookieResponse,
    SESSION_COOKIE_NAME,
    SessionCookies,
} from './guard/session-cookie.ts';
import { toCurrentSession } from './mappers/session.mapper.ts';

@ApiTags('auth')
@ApiCookieAuth(SESSION_COOKIE_NAME)
@Controller('me/session')
export class SessionController {
    constructor(
        private readonly _sessions: SessionService,
        private readonly _cookies: SessionCookies,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Read the current session' })
    @ApiOkResponse({ type: Session.Current })
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    read(@CurrentSession() session: SessionContext): Session.Current {
        return toCurrentSession(session);
    }

    @Delete()
    @Public()
    @HttpCode(204)
    @ApiOperation({ summary: 'Sign out: end the current session' })
    @ApiNoContentResponse()
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    @ApiForbiddenResponse({ type: ErrorResponse })
    @ApiTooManyRequestsResponse({ type: ErrorResponse })
    async end(
        @Req() request: IncomingMessage,
        @Res({ passthrough: true }) response: CookieResponse,
    ): Promise<void> {
        const presented = presentedSessionOf(request.headers);
        if (presented !== null) {
            await this._sessions.end(presented);
        }
        this._cookies.clear(response);
    }
}
