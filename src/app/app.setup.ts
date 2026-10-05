import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
    DocumentBuilder,
    type OpenAPIObject,
    SwaggerModule,
} from '@nestjs/swagger';
import { errorStatuses } from './error-statuses.ts';
import { AppExceptionFilter } from '../shared/http/exception.filter.ts';
import { EventLogger } from '../shared/logging/event-logger.ts';
import { toValidationException } from '../shared/http/validation.ts';

export const configureApp = (app: NestExpressApplication): void => {
    app.setGlobalPrefix('/api/v1');

    app.set('trust proxy', 1);
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
            errorStatuses,
        ),
    );
};

export const createOpenApiDocument = (app: INestApplication): OpenAPIObject => {
    const config = new DocumentBuilder()
        .setTitle('eBlocul API')
        .setDescription('API Documentation')
        .setVersion('1.0')
        .addServer('http://localhost:3000', 'local')

        .addBearerAuth(
            { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            'user-token',
        )
        .build();

    return SwaggerModule.createDocument(app, config, { deepScanRoutes: true });
};
