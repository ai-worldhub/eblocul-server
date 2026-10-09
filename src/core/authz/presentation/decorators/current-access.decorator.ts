import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { grantNotActive } from '../../domain/authz.errors.ts';
import type { Access } from '../../domain/entities/access.ts';

export type AccessCarrier = {
    currentAccess?: Access;
};

export const CurrentAccess = createParamDecorator(
    (_data: unknown, context: ExecutionContext): Access => {
        const { currentAccess } = context
            .switchToHttp()
            .getRequest<AccessCarrier>();
        if (currentAccess === undefined) {
            throw grantNotActive();
        }
        return currentAccess;
    },
);
