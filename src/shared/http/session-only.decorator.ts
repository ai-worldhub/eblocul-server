import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_SESSION_ONLY = 'isSessionOnly';

export const SessionOnly = (): CustomDecorator =>
    SetMetadata(IS_SESSION_ONLY, true);
