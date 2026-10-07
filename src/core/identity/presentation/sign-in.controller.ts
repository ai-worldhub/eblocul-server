import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../../shared/http/error.dto.ts';
import { Public } from '../../../shared/http/public.decorator.ts';
import { SignInService } from '../application/sign-in.service.ts';
import { Session } from './dto/session.dto.ts';
import { SignIn } from './dto/sign-in.dto.ts';
import { type CookieResponse, SessionCookies } from './session-cookie.ts';
import { toCurrentSession } from './session.mapper.ts';
import { RequireTrustedOrigin } from './trusted-origin.decorator.ts';

@ApiTags('auth')
@Controller('auth')
export class SignInController {
    constructor(
        private readonly _signIn: SignInService,
        private readonly _cookies: SessionCookies,
    ) {}

    @Post('admin-panel/login')
    @Public()
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
    async signInToAdminPanel(
        @Body() body: SignIn.AdminPanelRequest,
        @Res({ passthrough: true }) response: CookieResponse,
    ): Promise<Session.Current> {
        const started = await this._signIn.signInToAdminPanel({
            email: body.email,
            password: body.password,
        });
        this._cookies.issue(response, started.token, started.idleSeconds);
        return toCurrentSession(started.session);
    }
}
