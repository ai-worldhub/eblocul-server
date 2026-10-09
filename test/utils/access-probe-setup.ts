import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import type request from 'supertest';
import { DbService } from '../../src/shared/db/db.service.ts';
import { createAccessProbe, ProbeRecords } from './access-probe.ts';
import { cleanDatabase } from './clean-database.ts';
import type { ProbeApp, ProbeAppOptions } from './probe-app.ts';

export type AccessProbe = {
    app: NestExpressApplication<Server>;
    db: DbService;
    http: () => ReturnType<typeof request>;
};

export const useAccessProbe = (
    overrides?: ProbeAppOptions['overrides'],
): AccessProbe => {
    let probe: ProbeApp | undefined;

    const current = (): ProbeApp => {
        if (probe === undefined) {
            throw new Error(
                'Access probe is not ready: use it inside tests or hooks',
            );
        }
        return probe;
    };

    beforeAll(async () => {
        probe = await createAccessProbe(overrides);
        await probe.app.get(ProbeRecords).setUp();
    });

    beforeEach(async () => {
        await cleanDatabase(current().app.get(DbService));
    });

    afterAll(async () => {
        await probe?.app.get(ProbeRecords).tearDown();
        await probe?.app.close();
    });

    return {
        get app() {
            return current().app;
        },
        get db() {
            return current().app.get(DbService);
        },
        http: () => current().http(),
    };
};
