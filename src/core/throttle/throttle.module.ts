import { Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { JobsModule } from '../jobs/index.ts';
import { PurgeExpiredHandler } from './application/handlers/purge-expired.handler.ts';
import { AttemptLockService } from './application/services/attempt-lock.service.ts';
import { PurgeService } from './application/services/purge.service.ts';
import { RateLimitService } from './application/services/rate-limit.service.ts';
import { HmacKeyFingerprint } from './infrastructure/node/hmac-key-fingerprint.ts';
import { PrismaAttemptSeriesRepository } from './infrastructure/prisma/attempt-series.repository.ts';
import { PrismaRateBucketRepository } from './infrastructure/prisma/rate-bucket.repository.ts';
import { AttemptSeriesRepository } from './ports/attempt-series.repository.ts';
import { KeyFingerprint } from './ports/key-fingerprint.port.ts';
import { RateBucketRepository } from './ports/rate-bucket.repository.ts';
import { RateLimitGuard } from './presentation/guard/rate-limit.guard.ts';
import { RateLimitMarks } from './presentation/guard/rate-limit-marks.ts';

@Module({
    imports: [JobsModule, DiscoveryModule],
    providers: [
        RateLimitService,
        AttemptLockService,
        PurgeService,
        PurgeExpiredHandler,
        RateLimitMarks,
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: RateBucketRepository, useClass: PrismaRateBucketRepository },
        {
            provide: AttemptSeriesRepository,
            useClass: PrismaAttemptSeriesRepository,
        },
        { provide: KeyFingerprint, useClass: HmacKeyFingerprint },
    ],
    exports: [RateLimitService, AttemptLockService],
})
export class ThrottleModule {}
