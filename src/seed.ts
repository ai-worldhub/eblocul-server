import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { SeedModule } from './app/seed.module.ts';
import { SeedRunner } from './shared/seeding/seed-runner.service.ts';

const FAILURE_EXIT_CODE = 1;

const bootstrap = async (): Promise<void> => {
    const app = await NestFactory.createApplicationContext(SeedModule, {
        bufferLogs: true,
    });

    app.useLogger(app.get(Logger));

    const isSeeded = await app.get(SeedRunner).runAndReport();
    await app.close();

    if (!isSeeded) {
        process.exitCode = FAILURE_EXIT_CODE;
    }
};
await bootstrap();
