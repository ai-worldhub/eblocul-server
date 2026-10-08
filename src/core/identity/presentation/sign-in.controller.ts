import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import { ErrorResponse } from '../../../shared/http/error.dto.ts';
import { Public } from '../../../shared/http/public.decorator.ts';
import { RateLimit } from '../../../shared/http/rate-limit.decorator.ts';
import { SignInService } from '../application/services/sign-in.service.ts';
import { Session } from './dto/session.dto.ts';
import { SignIn } from './dto/sign-in.dto.ts';
import { sessionCookieOf } from './guard/presented-session.ts';
import { type CookieResponse, SessionCookies } from './guard/session-cookie.ts';
import { toCurrentSession } from './mappers/session.mapper.ts';
import { RequireTrustedOrigin } from './decorators/trusted-origin.decorator.ts';

@ApiTags('auth')
@Controller('auth')
export class SignInController {
    constructor(
        private readonly _signIn: SignInService,
        private readonly _cookies: SessionCookies,
    ) {}

    @Post('admin-panel/login')
    @Public()
    @RateLimit({ group: 'auth', burst: 30, refillSeconds: 2 })
    @RequireTrustedOrigin()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sign in to the administration panel with email and password',
    })
    @ApiOkResponse({
        type: Session.Current,
        description: 'The session id travels only in the Set-Cookie header',
    })
    @ApiBadRequestResponse({ type: ErrorResponse })
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    @ApiForbiddenResponse({ type: ErrorResponse })
    @ApiTooManyRequestsResponse({ type: ErrorResponse })
    async signInToAdminPanel(
        @Body() body: SignIn.AdminPanelRequest,
        @Req() request: IncomingMessage,
        @Res({ passthrough: true }) response: CookieResponse,
    ): Promise<Session.Current> {
        const started = await this._signIn.signInToAdminPanel({
            email: body.email,
            password: body.password,
            replacedToken: sessionCookieOf(request.headers),
        });
        this._cookies.issue(response, started.token, started.idleSeconds);
        return toCurrentSession(started.session);
    }
}
