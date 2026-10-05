import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.ts';
import { configureApp, createOpenApiDocument } from './app/app.setup.ts';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { EventLogger } from './shared/logging/event-logger.ts';

const bootstrap = async (): Promise<NestExpressApplication<Server>> => {
    const app = await NestFactory.create<NestExpressApplication<Server>>(
        AppModule,
        { bufferLogs: true },
    );

    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();
    configureApp(app);

    const server = app.getHttpServer();

    const configService = app.get(ConfigService);
    const runType = configService.get<string>('NODE_ENV');
    const port = configService.getOrThrow<number>('SERVER_PORT');

    if (runType === 'lab') {
        SwaggerModule.setup('swagger', app, createOpenApiDocument(app));
    }

    if (runType !== 'e2e') {
        await app.listen(port);

        server.requestTimeout = 0;
        server.timeout = 0;
        server.keepAliveTimeout = 5000;
        server.headersTimeout = 65000;

        app.get(EventLogger).info('app.started', { port });
    }

    return app;
};
await bootstrap();
