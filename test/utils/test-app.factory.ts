import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app/app.module.ts';
import { configureApp } from '../../src/app/app.setup.ts';
import { DbService } from '../../src/shared/db/db.service.ts';

export type TestApp = {
    app: NestExpressApplication<Server>;
    db: DbService;
    http: () => ReturnType<typeof request>;
};

export type TestAppOverrides = (
    builder: TestingModuleBuilder,
) => TestingModuleBuilder;

const baseUrlOf = (app: NestExpressApplication<Server>): string => {
    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
        throw new Error('Test app is not listening on a TCP port');
    }
    return `http://127.0.0.1:${address.port}`;
};

export const createTestApp = async (
    overrides: TestAppOverrides = (builder) => builder,
): Promise<TestApp> => {
    const moduleRef = await overrides(
        Test.createTestingModule({ imports: [AppModule] }),
    ).compile();

    const app =
        moduleRef.createNestApplication<NestExpressApplication<Server>>();
    configureApp(app);
    await app.listen(0, '127.0.0.1');

    return {
        app,
        db: app.get(DbService),
        http: () => request(baseUrlOf(app)),
    };
};
