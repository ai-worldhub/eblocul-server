import type { ModuleMetadata, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Server } from 'node:http';
import { Writable } from 'node:stream';
import request from 'supertest';
import { configureApp } from '../../src/app/app.setup.ts';
import { AppLoggingModule } from '../../src/shared/logging/logging.module.ts';

export type ProbeApp = {
    app: NestExpressApplication<Server>;
    http: () => ReturnType<typeof request>;
};

const silent = (): Writable =>
    new Writable({
        write: (_chunk, _encoding, callback) => {
            callback();
        },
    });

export type ProbeAppOptions = {
    logs?: Writable;
    imports?: ModuleMetadata['imports'];
    env?: Record<string, string>;
    overrides?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
};

export const createProbeApp = async (
    controllers: Type<unknown>[],
    options: ProbeAppOptions = {},
): Promise<ProbeApp> => {
    const builder = Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                isGlobal: true,
                ignoreEnvFile: true,
                load: [() => ({ LOG_FORMAT: 'json', ...options.env })],
            }),
            AppLoggingModule.register(options.logs ?? silent()),
            ...(options.imports ?? []),
        ],
        controllers,
    });
    const moduleRef = await (options.overrides ?? ((it) => it))(
        builder,
    ).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication<Server>>(
        { logger: false },
    );
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
        throw new Error('Probe app is not listening on a TCP port');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return { app, http: () => request(baseUrl) };
};
