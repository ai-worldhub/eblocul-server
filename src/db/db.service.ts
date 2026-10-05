import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

@Injectable()
export class DbService extends PrismaClient implements OnModuleDestroy {
    constructor(configService: ConfigService) {
        const adapter = new PrismaPg({
            connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        });
        super({ adapter });
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}
