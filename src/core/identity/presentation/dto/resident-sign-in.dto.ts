import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { SessionApplication } from '../../domain/entities/session.entity.ts';
import {
    PERSON_NAME_MAX_LENGTH,
    PERSON_NAME_PATTERN,
} from '../../domain/rules/person-name.ts';
import { PHONE_INPUT_MAX_LENGTH } from '../../domain/rules/phone.ts';
import {
    CODE_PATTERN,
    type CodeOutcome,
} from '../../domain/rules/phone-code.ts';

const OUTCOMES = [
    'signed_in',
    'registration_required',
    'consent_required',
] as const satisfies readonly CodeOutcome[];

const RESIDENT_APPLICATIONS = [
    'resident_app',
] as const satisfies readonly SessionApplication[];

const PENDING_TOKEN_MAX_LENGTH = 128;
const CONSENT_VERSION_MAX_LENGTH = 64;

export namespace ResidentSignIn {
    @ApiSchema({ name: 'ResidentSignIn-CodeRequest' })
    export class CodeRequest {
        @ApiProperty({
            example: '069 123 456',
            description:
                'A Moldovan number in any written form: 069123456, 69123456, +37369123456, 0037369123456',
            maxLength: PHONE_INPUT_MAX_LENGTH,
        })
        @IsString()
        @MinLength(1)
        @MaxLength(PHONE_INPUT_MAX_LENGTH)
        phone: string;
    }

    @ApiSchema({ name: 'ResidentSignIn-CodeResponse' })
    export class CodeResponse {
        @ApiProperty({ example: 60 })
        resendAfterSeconds: number;

        @ApiProperty({ example: 600 })
        expiresInSeconds: number;
    }

    @ApiSchema({ name: 'ResidentSignIn-LoginRequest' })
    export class LoginRequest {
        @ApiProperty({
            example: '069 123 456',
            maxLength: PHONE_INPUT_MAX_LENGTH,
        })
        @IsString()
        @MinLength(1)
        @MaxLength(PHONE_INPUT_MAX_LENGTH)
        phone: string;

        @ApiProperty({ example: '123456', description: 'Six digits' })
        @IsString()
        @Matches(CODE_PATTERN)
        code: string;
    }

    @ApiSchema({ name: 'ResidentSignIn-StartedSession' })
    export class StartedSession {
        @ApiProperty({
            description:
                'The session id: send it as Authorization: Bearer <token>. It is returned only here',
        })
        token: string;

        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10' })
        accountId: string;

        @ApiProperty({ enum: RESIDENT_APPLICATIONS, example: 'resident_app' })
        application: SessionApplication;
    }

    @ApiSchema({ name: 'ResidentSignIn-Pending' })
    export class Pending {
        @ApiProperty({
            description:
                'One-time token that finishes the sign-in without a second code',
        })
        token: string;

        @ApiProperty({ example: 1800 })
        expiresInSeconds: number;

        @ApiProperty({
            example: '2026-10',
            description:
                'Version of the Policy and the Terms to show and to send back',
        })
        consentVersion: string;
    }

    @ApiSchema({ name: 'ResidentSignIn-LoginResponse' })
    export class LoginResponse {
        @ApiProperty({ enum: OUTCOMES, example: 'signed_in' })
        outcome: CodeOutcome;

        @ApiProperty({ type: () => StartedSession, nullable: true })
        session: StartedSession | null;

        @ApiProperty({ type: () => Pending, nullable: true })
        pending: Pending | null;
    }

    @ApiSchema({ name: 'ResidentSignIn-ConsentRequest' })
    export class ConsentRequest {
        @ApiProperty({ maxLength: PENDING_TOKEN_MAX_LENGTH })
        @IsString()
        @MinLength(1)
        @MaxLength(PENDING_TOKEN_MAX_LENGTH)
        pendingToken: string;

        @ApiProperty({ example: '2026-10' })
        @IsString()
        @MinLength(1)
        @MaxLength(CONSENT_VERSION_MAX_LENGTH)
        consentVersion: string;
    }

    @ApiSchema({ name: 'ResidentSignIn-RegistrationRequest' })
    export class RegistrationRequest extends ConsentRequest {
        @ApiProperty({ example: 'Ion', maxLength: PERSON_NAME_MAX_LENGTH })
        @IsString()
        @Matches(PERSON_NAME_PATTERN)
        @MaxLength(PERSON_NAME_MAX_LENGTH)
        firstName: string;

        @ApiProperty({ example: 'Popescu', maxLength: PERSON_NAME_MAX_LENGTH })
        @IsString()
        @Matches(PERSON_NAME_PATTERN)
        @MaxLength(PERSON_NAME_MAX_LENGTH)
        lastName: string;
    }

    @ApiSchema({ name: 'ResidentSignIn-SessionResponse' })
    export class SessionResponse {
        @ApiProperty({ type: () => StartedSession })
        session: StartedSession;
    }
}
