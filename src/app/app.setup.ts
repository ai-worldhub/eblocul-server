import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
    DocumentBuilder,
    type OpenAPIObject,
    SwaggerModule,
} from '@nestjs/swagger';
import { SESSION_COOKIE_NAME } from '../core/identity/index.ts';
import { ERROR_STATUSES } from './error-statuses.ts';
import { AppExceptionFilter } from '../shared/http/exception.filter.ts';
import { EventLogger } from '../shared/logging/event-logger.ts';
import { toValidationException } from '../shared/http/validation.ts';

const ORIGIN_SEPARATOR = ',';

export const configureApp = (app: NestExpressApplication): void => {
    app.setGlobalPrefix('/api/v1');

    app.set('trust proxy', 1);
    app.enableCors({
        origin: (app.get(ConfigService).get<string>('WEB_PANEL_ORIGINS') ?? '')
            .split(ORIGIN_SEPARATOR)
            .filter((origin) => origin !== ''),
        credentials: true,
    });
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            exceptionFactory: toValidationException,
        }),
    );
    app.useGlobalFilters(
        new AppExceptionFilter(
            app.get(HttpAdapterHost),
            app.get(EventLogger),
            ERROR_STATUSES,
        ),
    );
};

export const createOpenApiDocument = (app: INestApplication): OpenAPIObject => {
    const config = new DocumentBuilder()
        .setTitle('eBlocul API')
        .setDescription('API Documentation')
        .setVersion('1.0')
        .addServer('http://localhost:3000', 'local')

        .addSecurity('user-token', { type: 'http', scheme: 'bearer' })
        .addCookieAuth(SESSION_COOKIE_NAME, { type: 'apiKey', in: 'cookie' })
        .build();

    return SwaggerModule.createDocument(app, config, { deepScanRoutes: true });
};
