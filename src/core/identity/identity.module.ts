import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottleModule } from '../throttle/index.ts';
import { AccountService } from './application/services/account.service.ts';
import { TestAdminSeed } from './application/seeds/test-admin.seed.ts';
import { SessionService } from './application/services/session.service.ts';
import { SignInService } from './application/services/sign-in.service.ts';
import { ArgonPasswordHasher } from './infrastructure/node/argon-password-hasher.ts';
import { CryptoSessionTokenSource } from './infrastructure/node/crypto-session-token-source.ts';
import { PrismaSessionRepository } from './infrastructure/prisma/session.repository.ts';
import { PasswordHasher } from './ports/password-hasher.port.ts';
import { SessionRepository } from './ports/session.repository.ts';
import { SessionTokenSource } from './ports/session-token-source.port.ts';
import { SessionController } from './presentation/session.controller.ts';
import { SessionCookies } from './presentation/guard/session-cookie.ts';
import { SessionGuard } from './presentation/guard/session.guard.ts';
import { SignInController } from './presentation/sign-in.controller.ts';
import { TrustedOrigins } from './presentation/guard/trusted-origins.ts';

@Module({
    imports: [ThrottleModule],
    controllers: [SignInController, SessionController],
    providers: [
        AccountService,
        SessionService,
        SignInService,
        SessionCookies,
        TrustedOrigins,
        TestAdminSeed,
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: SessionRepository, useClass: PrismaSessionRepository },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        { provide: SessionTokenSource, useClass: CryptoSessionTokenSource },
    ],
})
export class IdentityModule {}
