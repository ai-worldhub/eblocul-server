import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JobsModule } from '../jobs/index.ts';
import { ThrottleModule } from '../throttle/index.ts';
import { PurgePhoneCodesHandler } from './application/handlers/purge-phone-codes.handler.ts';
import { AccountService } from './application/services/account.service.ts';
import { ConsentService } from './application/services/consent.service.ts';
import { PhoneCodeService } from './application/services/phone-code.service.ts';
import { ResidentSignInService } from './application/services/resident-sign-in.service.ts';
import { TestAdminSeed } from './application/seeds/test-admin.seed.ts';
import { SessionService } from './application/services/session.service.ts';
import { SignInService } from './application/services/sign-in.service.ts';
import { fixedCodeFor } from './domain/rules/fixed-code.ts';
import { FixedVerificationCodeSource } from './infrastructure/lab/fixed-verification-code-source.ts';
import { SilentVerificationCodeSender } from './infrastructure/lab/silent-verification-code-sender.ts';
import { ArgonPasswordHasher } from './infrastructure/node/argon-password-hasher.ts';
import { CryptoSessionTokenSource } from './infrastructure/node/crypto-session-token-source.ts';
import { CryptoVerificationCodeSource } from './infrastructure/node/crypto-verification-code-source.ts';
import { PrismaPhoneCodeRepository } from './infrastructure/prisma/phone-code.repository.ts';
import { PrismaSessionRepository } from './infrastructure/prisma/session.repository.ts';
import { MissingVerificationCodeSender } from './infrastructure/sms/missing-verification-code-sender.ts';
import { PasswordHasher } from './ports/password-hasher.port.ts';
import { PhoneCodeRepository } from './ports/phone-code.repository.ts';
import { SessionRepository } from './ports/session.repository.ts';
import { SessionTokenSource } from './ports/session-token-source.port.ts';
import { VerificationCodeSender } from './ports/verification-code-sender.port.ts';
import { VerificationCodeSource } from './ports/verification-code-source.port.ts';
import { ResidentSignInController } from './presentation/resident-sign-in.controller.ts';
import { SessionController } from './presentation/session.controller.ts';
import { SessionCookies } from './presentation/guard/session-cookie.ts';
import { SessionGuard } from './presentation/guard/session.guard.ts';
import { SignInController } from './presentation/sign-in.controller.ts';
import { TrustedOrigins } from './presentation/guard/trusted-origins.ts';

const fixedCodeOf = (config: ConfigService): string | null =>
    fixedCodeFor(
        config.get<string>('NODE_ENV'),
        config.get<string>('LAB_FIXED_SMS_CODE'),
    );

@Module({
    imports: [ThrottleModule, JobsModule],
    controllers: [
        SignInController,
        ResidentSignInController,
        SessionController,
    ],
    providers: [
        AccountService,
        ConsentService,
        SessionService,
        SignInService,
        PhoneCodeService,
        ResidentSignInService,
        PurgePhoneCodesHandler,
        SessionCookies,
        TrustedOrigins,
        TestAdminSeed,
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: SessionRepository, useClass: PrismaSessionRepository },
        { provide: PhoneCodeRepository, useClass: PrismaPhoneCodeRepository },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        { provide: SessionTokenSource, useClass: CryptoSessionTokenSource },
        {
            provide: VerificationCodeSource,
            inject: [ConfigService],
            useFactory: (config: ConfigService): VerificationCodeSource => {
                const fixedCode = fixedCodeOf(config);
                return fixedCode === null
                    ? new CryptoVerificationCodeSource()
                    : new FixedVerificationCodeSource(fixedCode);
            },
        },
        {
            provide: VerificationCodeSender,
            inject: [ConfigService],
            useFactory: (config: ConfigService): VerificationCodeSender =>
                fixedCodeOf(config) === null
                    ? new MissingVerificationCodeSender()
                    : new SilentVerificationCodeSender(),
        },
    ],
    exports: [AccountService],
})
export class IdentityModule {}
