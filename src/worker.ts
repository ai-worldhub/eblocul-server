import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './app/worker.module.ts';

const bootstrap = async (): Promise<void> => {
    const app = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });

    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();
};
await bootstrap();
