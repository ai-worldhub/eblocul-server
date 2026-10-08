import { Module } from '@nestjs/common';
import { IdentityModule } from '../core/identity/index.ts';
import { JobsModule } from '../core/jobs/index.ts';
import { ThrottleModule } from '../core/throttle/index.ts';
import { SetupConfigModule } from '../shared/configs/setup-config.module.ts';
import { DbModule } from '../shared/db/db.module.ts';
import { ClockModule } from '../shared/clock/clock.module.ts';
import { HealthModule } from '../shared/health/health.module.ts';
import { IdsModule } from '../shared/ids/ids.module.ts';
import { AppLoggingModule } from '../shared/logging/logging.module.ts';

@Module({
    imports: [
        SetupConfigModule,
        DbModule,
        ClockModule,
        IdsModule,
        HealthModule,
        AppLoggingModule.register(),
        JobsModule,
        ThrottleModule,
        IdentityModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
