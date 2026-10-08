import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
    type SessionContext,
    sessionRequired,
} from '../../domain/session.entity.ts';

export type SessionCarrier = {
    currentSession?: SessionContext;
};

export const CurrentSession = createParamDecorator(
    (_data: unknown, context: ExecutionContext): SessionContext => {
        const { currentSession } = context
            .switchToHttp()
            .getRequest<SessionCarrier>();
        if (currentSession === undefined) {
            throw sessionRequired();
        }
        return currentSession;
    },
);
