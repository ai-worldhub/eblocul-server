import {
    Injectable,
    type OnModuleDestroy,
    type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { assertUtcSession, withUtcSession } from './utc-session.ts';

@Injectable()
export class DbService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
{
    constructor(configService: ConfigService) {
        const adapter = new PrismaPg({
            connectionString: withUtcSession(
                configService.getOrThrow<string>('DATABASE_URL'),
            ),
        });
        super({ adapter });
    }

    async onModuleInit(): Promise<void> {
        await assertUtcSession(this);
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}
