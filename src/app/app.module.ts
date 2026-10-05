import { Module } from '@nestjs/common';
import { SetupConfigModule } from '../configs/setup-config.module.ts';
import { DbModule } from '../db/db.module.ts';
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
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
