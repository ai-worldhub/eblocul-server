import type { CustomDecorator } from '@nestjs/common';
import { RateLimit } from '../../../../shared/http/rate-limit.decorator.ts';

const AUTH_RATE_LIMIT = { group: 'auth', burst: 30, refillSeconds: 2 } as const;

export const AuthRateLimit = (): CustomDecorator => RateLimit(AUTH_RATE_LIMIT);
