import {
    type CanActivate,
    type ExecutionContext,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import type { SessionCarrier } from '../../../identity/index.ts';
import { AccessService } from '../../application/services/access.service.ts';
import { grantNotActive } from '../../domain/authz.errors.ts';
import type { TargetReference } from '../../domain/entities/access-target.ts';
import {
    ACCESS_GRANT_HEADER,
    ACCESS_MARK,
    type AccessMark,
    type AccessTargetMark,
} from '../decorators/access.decorator.ts';
import type { AccessCarrier } from '../decorators/current-access.decorator.ts';

type AccessRequest = IncomingMessage &
    SessionCarrier &
    AccessCarrier & { params?: Record<string, string | undefined> };

const HEADER_KEY = ACCESS_GRANT_HEADER.toLowerCase();

const headerOf = (request: AccessRequest): string | null => {
    const value = request.headers[HEADER_KEY];
    return typeof value === 'string' ? value : null;
};

const referenceOf = (
    mark: AccessTargetMark,
    request: AccessRequest,
): TargetReference =>
    'node' in mark
        ? { kind: 'node', nodeId: request.params?.[mark.node] ?? '' }
        : { kind: 'unit', unitId: request.params?.[mark.unit] ?? '' };

@Injectable()
export class AccessGuard implements CanActivate {
    constructor(
        private readonly _reflector: Reflector,
        private readonly _access: AccessService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') {
            return true;
        }
        const mark = this._reflector.get<AccessMark | undefined>(
            ACCESS_MARK,
            context.getHandler(),
        );
        if (mark === undefined) {
            return true;
        }
        const request = context.switchToHttp().getRequest<AccessRequest>();
        if (request.currentSession === undefined) {
            throw grantNotActive();
        }
        request.currentAccess = await this._access.open(
            request.currentSession,
            {
                grantId: headerOf(request),
                action: mark.action,
                ...(mark.target === null
                    ? {}
                    : { target: referenceOf(mark.target, request) }),
            },
        );
        return true;
    }
}
