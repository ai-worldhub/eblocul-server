import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { AccessService } from './application/services/access.service.ts';
import { GrantListService } from './application/services/grant-list.service.ts';
import type { AccessAction } from './domain/rules/access-action.ts';
import { PrismaAccessQueries } from './infrastructure/prisma/access-queries.ts';
import { AccessQueries } from './ports/access-queries.port.ts';
import {
    REGISTERED_ACTIONS,
    AccessMarks,
} from './presentation/guard/access-marks.ts';
import { AccessGuard } from './presentation/guard/access.guard.ts';
import { MyAccessController } from './presentation/my-access.controller.ts';

@Module({})
export class AuthzModule {
    static register(actions: readonly AccessAction[]): DynamicModule {
        return {
            module: AuthzModule,
            global: true,
            imports: [DiscoveryModule],
            controllers: [MyAccessController],
            providers: [
                AccessService,
                GrantListService,
                AccessMarks,
                { provide: REGISTERED_ACTIONS, useValue: actions },
                { provide: APP_GUARD, useClass: AccessGuard },
                { provide: AccessQueries, useClass: PrismaAccessQueries },
            ],
            exports: [AccessService],
        };
    }
}
