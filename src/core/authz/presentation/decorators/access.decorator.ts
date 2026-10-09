import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiForbiddenResponse,
    ApiHeader,
    ApiNotFoundResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponse } from '../../../../shared/http/error.dto.ts';
import type { AccessAction } from '../../domain/rules/access-action.ts';

export const ACCESS_MARK = 'accessMark';
export const ACCESS_GRANT_HEADER = 'X-Access-Grant';

export type AccessTargetMark = { node: string } | { unit: string };

export type AccessMark = {
    action: AccessAction;
    target: AccessTargetMark | null;
};

export const Access = (
    action: AccessAction,
    target?: AccessTargetMark,
): MethodDecorator =>
    applyDecorators(
        SetMetadata(ACCESS_MARK, {
            action,
            target: target ?? null,
        } satisfies AccessMark),
        ApiHeader({
            name: ACCESS_GRANT_HEADER,
            required: true,
            description: 'Id of the grant from GET /me/access to act by',
        }),
        ApiBadRequestResponse({ type: ErrorResponse }),
        ApiUnauthorizedResponse({ type: ErrorResponse }),
        ApiForbiddenResponse({ type: ErrorResponse }),
        ...(target === undefined
            ? []
            : [ApiNotFoundResponse({ type: ErrorResponse })]),
    );
