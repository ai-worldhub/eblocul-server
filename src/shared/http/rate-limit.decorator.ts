import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const RATE_LIMIT = 'rateLimit';
export const NO_RATE_LIMIT = 'none';

export type RateLimitOptions = {
    group: string;
    burst: number;
    refillSeconds: number;
};

export type RateLimitMark = RateLimitOptions | typeof NO_RATE_LIMIT;

export const RateLimit = (options: RateLimitOptions): CustomDecorator =>
    SetMetadata(RATE_LIMIT, options);

export const NoRateLimit = (): CustomDecorator =>
    SetMetadata(RATE_LIMIT, NO_RATE_LIMIT);
