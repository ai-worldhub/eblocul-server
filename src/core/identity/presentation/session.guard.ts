import {
    type CanActivate,
    type ExecutionContext,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { IS_PUBLIC } from '../../../shared/http/public.decorator.ts';
import { SessionService } from '../application/session.service.ts';
import { IdentityError } from '../domain/identity.errors.ts';
import { sessionRequired } from '../domain/session.entity.ts';
import type { SessionCarrier } from './current-session.decorator.ts';
import { presentedSessionOf, sessionCookieOf } from './presented-session.ts';
import { type CookieResponse, SessionCookies } from './session-cookie.ts';
import { REQUIRES_TRUSTED_ORIGIN } from './trusted-origin.decorator.ts';
import { TrustedOrigins } from './trusted-origins.ts';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

type SessionRequest = IncomingMessage &
    SessionCarrier & { user?: { userId: string } };

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(
        private readonly _reflector: Reflector,
        private readonly _sessions: SessionService,
        private readonly _cookies: SessionCookies,
        private readonly _origins: TrustedOrigins,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') {
            return true;
        }
        const request = context.switchToHttp().getRequest<SessionRequest>();
        this._assertTrustedOrigin(context, request);
        if (this._isMarked(context, IS_PUBLIC)) {
            return true;
        }

        const presented = presentedSessionOf(request.headers);
        if (presented === null) {
            throw sessionRequired();
        }
        const { session, idleSeconds, isRenewed } =
            await this._sessions.authenticate(presented);
        request.currentSession = session;
        request.user = { userId: session.accountId };
        if (isRenewed && presented.transport === 'cookie') {
            this._cookies.issue(
                context.switchToHttp().getResponse<CookieResponse>(),
                presented.token,
                idleSeconds,
            );
        }
        return true;
    }

    private _assertTrustedOrigin(
        context: ExecutionContext,
        request: SessionRequest,
    ): void {
        if (SAFE_METHODS.has(request.method ?? '')) {
            return;
        }
        const isBrowserRequest =
            this._isMarked(context, REQUIRES_TRUSTED_ORIGIN) ||
            sessionCookieOf(request.headers) !== null;
        if (isBrowserRequest && !this._origins.has(request.headers.origin)) {
            throw new IdentityError(
                'IDENTITY_ORIGIN_FORBIDDEN',
                'Request origin is not allowed',
            );
        }
    }

    private _isMarked(context: ExecutionContext, key: string): boolean {
        return (
            this._reflector.getAllAndOverride<boolean | undefined>(key, [
                context.getHandler(),
                context.getClass(),
            ]) === true
        );
    }
}
