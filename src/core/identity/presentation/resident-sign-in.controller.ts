import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../../shared/http/error.dto.ts';
import { Public } from '../../../shared/http/public.decorator.ts';
import { PhoneCodeService } from '../application/services/phone-code.service.ts';
import { ResidentSignInService } from '../application/services/resident-sign-in.service.ts';
import { AuthRateLimit } from './decorators/auth-rate-limit.decorator.ts';
import { ResidentSignIn } from './dto/resident-sign-in.dto.ts';
import {
    toLoginResponse,
    toSessionResponse,
} from './mappers/resident-sign-in.mapper.ts';

@ApiTags('auth')
@Controller('auth/resident-app')
export class ResidentSignInController {
    constructor(
        private readonly _codes: PhoneCodeService,
        private readonly _signIn: ResidentSignInService,
    ) {}

    @Post('codes')
    @Public()
    @AuthRateLimit()
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Send a sign-in code to a phone; the answer is the same for a registered and an unknown number',
    })
    @ApiOkResponse({ type: ResidentSignIn.CodeResponse })
    @ApiBadRequestResponse({ type: ErrorResponse })
    @ApiTooManyRequestsResponse({ type: ErrorResponse })
    requestCode(
        @Body() body: ResidentSignIn.CodeRequest,
    ): Promise<ResidentSignIn.CodeResponse> {
        return this._codes.issue(body.phone);
    }

    @Post('login')
    @Public()
    @AuthRateLimit()
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Check the code: sign in, or tell that the registration or the consent is still needed',
    })
    @ApiOkResponse({ type: ResidentSignIn.LoginResponse })
    @ApiBadRequestResponse({ type: ErrorResponse })
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    @ApiTooManyRequestsResponse({ type: ErrorResponse })
    async signIn(
        @Body() body: ResidentSignIn.LoginRequest,
    ): Promise<ResidentSignIn.LoginResponse> {
        return toLoginResponse(
            await this._signIn.confirmCode({
                phone: body.phone,
                code: body.code,
            }),
        );
    }

    @Post('registration')
    @Public()
    @AuthRateLimit()
    @ApiOperation({
        summary:
            'Finish the registration: name, consent with the Policy and the Terms',
    })
    @ApiCreatedResponse({ type: ResidentSignIn.SessionResponse })
    @ApiBadRequestResponse({ type: ErrorResponse })
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    @ApiConflictResponse({ type: ErrorResponse })
    @ApiTooManyRequestsResponse({ type: ErrorResponse })
    async register(
        @Body() body: ResidentSignIn.RegistrationRequest,
    ): Promise<ResidentSignIn.SessionResponse> {
        return toSessionResponse(
            await this._signIn.register({
                pendingToken: body.pendingToken,
                consentVersion: body.consentVersion,
                firstName: body.firstName,
                lastName: body.lastName,
            }),
        );
    }

    @Post('consent')
    @Public()
    @AuthRateLimit()
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Accept the Policy and the Terms for an account that already exists and sign in',
    })
    @ApiOkResponse({ type: ResidentSignIn.SessionResponse })
    @ApiBadRequestResponse({ type: ErrorResponse })
    @ApiUnauthorizedResponse({ type: ErrorResponse })
    @ApiConflictResponse({ type: ErrorResponse })
    @ApiTooManyRequestsResponse({ type: ErrorResponse })
    async acceptConsent(
        @Body() body: ResidentSignIn.ConsentRequest,
    ): Promise<ResidentSignIn.SessionResponse> {
        return toSessionResponse(
            await this._signIn.acceptConsent({
                pendingToken: body.pendingToken,
                consentVersion: body.consentVersion,
            }),
        );
    }
}
