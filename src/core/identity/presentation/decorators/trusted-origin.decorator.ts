import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const REQUIRES_TRUSTED_ORIGIN = 'requiresTrustedOrigin';

export const RequireTrustedOrigin = (): CustomDecorator =>
    SetMetadata(REQUIRES_TRUSTED_ORIGIN, true);
