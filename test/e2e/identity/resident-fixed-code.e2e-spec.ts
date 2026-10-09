import { IdentityModule } from '../../../src/core/identity/index.ts';
import { ClockModule } from '../../../src/shared/clock/clock.module.ts';
import { DbModule } from '../../../src/shared/db/db.module.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { IdsModule } from '../../../src/shared/ids/ids.module.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';
import {
    confirmCode,
    loginBodyOf,
    requestCode,
    RESIDENT,
} from '../../utils/resident-session.ts';
import { responseBody } from '../../utils/response-body.ts';

type ErrorBody = { code: string };

const FIXED_CODE = '000000';

describe('Fixed SMS code of the lab (e2e)', () => {
    let probe: ProbeApp | undefined;

    const start = async (
        environment: string,
        fixedCode: string | null,
    ): Promise<ProbeApp> => {
        vi.stubEnv('NODE_ENV', environment);
        if (fixedCode !== null) {
            vi.stubEnv('LAB_FIXED_SMS_CODE', fixedCode);
        }
        probe = await createProbeApp([], {
            imports: [DbModule, ClockModule, IdsModule, IdentityModule],
        });
        vi.unstubAllEnvs();
        await cleanDatabase(probe.app.get(DbService));
        return probe;
    };

    afterEach(async () => {
        vi.unstubAllEnvs();
        await probe?.app.close();
        probe = undefined;
    });

    it('signs in with the fixed code in the lab, without any SMS channel', async () => {
        const lab = await start('lab', FIXED_CODE);

        await requestCode(lab, RESIDENT.phone).expect(200);
        const confirmed = await confirmCode(
            lab,
            RESIDENT.phone,
            FIXED_CODE,
        ).expect(200);

        expect(loginBodyOf(confirmed).outcome).toBe('registration_required');
    });

    it('never accepts the fixed code in production, even when the variable is set', async () => {
        const production = await start('production', FIXED_CODE);

        const requested = await requestCode(production, RESIDENT.phone).expect(
            500,
        );
        const confirmed = await confirmCode(
            production,
            RESIDENT.phone,
            FIXED_CODE,
        ).expect(401);

        expect(responseBody<ErrorBody>(requested).code).toBe('INTERNAL_ERROR');
        expect(responseBody<ErrorBody>(confirmed).code).toBe(
            'IDENTITY_CODE_INVALID',
        );
        const db = production.app.get(DbService);
        expect(await db.session.count()).toBe(0);
        expect(await db.phoneCode.count()).toBe(0);
    });

    it('sends nothing and accepts no fixed code in the lab when the variable is not set', async () => {
        const lab = await start('lab', null);

        await requestCode(lab, RESIDENT.phone).expect(500);
        await confirmCode(lab, RESIDENT.phone, FIXED_CODE).expect(401);
    });
});
