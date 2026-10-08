import { Writable } from 'node:stream';
import { IdentityModule } from '../../../src/core/identity/index.ts';
import { ClockModule } from '../../../src/shared/clock/clock.module.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { SetupConfigModule } from '../../../src/shared/configs/setup-config.module.ts';
import { DbModule } from '../../../src/shared/db/db.module.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { IdsModule } from '../../../src/shared/ids/ids.module.ts';
import {
    ADMIN,
    createAdmin,
    LOGIN_PATH,
    PANEL_ORIGIN,
    signIn,
} from '../../utils/admin-session.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';

const WRONG_PASSWORD = 'wrong-password-99';
const UNKNOWN_EMAIL = 'nobody@example.com';
const LOOPBACK = '127.0.0.1';
const MAX_FAILURES = 5;
const AUTH_BURST = 30;
const FLUSH_MS = 20;
const NOW = new Date('2026-10-08T10:00:00.000Z');

type Answer = {
    status: number;
    text: string;
    headers: Record<string, unknown>;
};
type LogLine = Record<string, unknown>;

const BASE_FIELDS = ['level', 'time', 'pid', 'hostname', 'requestId', 'event'];

describe('Throttle keeps emails, addresses and fingerprints out of answers and logs (e2e)', () => {
    let logged = '';
    let probe: ProbeApp;

    const flush = (): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, FLUSH_MS));

    beforeAll(async () => {
        probe = await createProbeApp([], {
            logs: new Writable({
                write: (chunk: Buffer, _encoding, callback) => {
                    logged += chunk.toString();
                    callback();
                },
            }),
            imports: [
                SetupConfigModule,
                DbModule,
                ClockModule,
                IdsModule,
                IdentityModule,
            ],
            overrides: (builder) =>
                builder.overrideProvider(Clock).useValue(new ClockDouble(NOW)),
        });
    });

    beforeEach(async () => {
        await cleanDatabase(probe.app.get(DbService));
        logged = '';
    });

    afterAll(async () => {
        await probe.app.close();
    });

    it('names only the rule, numbers and the account id', async () => {
        const accountId = await createAdmin(probe);
        const answers: Answer[] = [];
        const fail = async (email: string): Promise<void> => {
            answers.push(
                await signIn(probe, { email, password: WRONG_PASSWORD }),
            );
        };

        for (let attempt = 0; attempt <= MAX_FAILURES; attempt += 1) {
            await fail(ADMIN.email);
            await fail(UNKNOWN_EMAIL);
        }
        while (answers.at(-1)?.status !== 429 || answers.length <= AUTH_BURST) {
            answers.push(
                await probe
                    .http()
                    .post(LOGIN_PATH)
                    .set('Origin', PANEL_ORIGIN)
                    .set('X-Forwarded-For', '203.0.113.7')
                    .send({}),
            );
        }
        await flush();

        const db = probe.app.get(DbService);
        const keys = [
            ...(await db.rateBucket.findMany()),
            ...(await db.attemptSeries.findMany()),
        ].map(({ key }) => key);
        const secrets = [
            ADMIN.email,
            UNKNOWN_EMAIL,
            WRONG_PASSWORD,
            LOOPBACK,
            '203.0.113.7',
            'e2e-secret-not-a-real-key-0123456789',
            ...keys,
        ];
        const answered = answers
            .map(({ text, headers }) => `${text}\n${JSON.stringify(headers)}`)
            .join('\n');
        const lines = logged
            .split('\n')
            .filter((line) => line !== '')
            .map((line) => JSON.parse(line) as LogLine);
        const eventsNamed = (prefix: string): LogLine[] =>
            lines
                .filter((line) => String(line['event']).startsWith(prefix))
                .map((line) =>
                    Object.fromEntries(
                        Object.entries(line).filter(
                            ([field]) => !BASE_FIELDS.includes(field),
                        ),
                    ),
                );

        expect(keys).toHaveLength(3);
        expect(answers.at(-1)?.status).toBe(429);
        for (const secret of secrets) {
            expect(answered).not.toContain(secret);
            expect(logged).not.toContain(secret);
        }
        expect(eventsNamed('throttle.attempts_locked')).toEqual([
            { rule: 'identity.admin_password', lockSeconds: 900 },
            { rule: 'identity.admin_password', lockSeconds: 900 },
        ]);
        expect(eventsNamed('throttle.rate_limited')).toEqual([
            { group: 'auth', retryAfterSeconds: 2 },
        ]);
        expect(eventsNamed('identity.sign_in_locked')).toEqual([
            { accountId, application: 'admin_panel' },
            { accountId: null, application: 'admin_panel' },
        ]);
        expect(eventsNamed('identity.sign_in_failed')).toHaveLength(
            MAX_FAILURES * 2,
        );
        expect(
            lines.filter((line) => line['event'] === 'http.request'),
        ).toHaveLength(answers.length);
    });
});
