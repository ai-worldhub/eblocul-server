import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { IdentityModule } from '../../../src/core/identity/index.ts';
import { ClockModule } from '../../../src/shared/clock/clock.module.ts';
import { SetupConfigModule } from '../../../src/shared/configs/setup-config.module.ts';
import { DbModule } from '../../../src/shared/db/db.module.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { IdsModule } from '../../../src/shared/ids/ids.module.ts';
import {
    ADMIN,
    cookieHeader,
    createAdmin,
    issuedCookie,
    LOGIN_PATH,
    PANEL_ORIGIN,
    SESSION_PATH,
    signIn,
} from '../../utils/admin-session.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';

const WRONG_PASSWORD = 'wrong-password-99';
const UNKNOWN_EMAIL = 'nobody@example.com';
const HASH_MARK = '$argon2';
const FLUSH_MS = 20;

type Answer = { text: string; headers: Record<string, unknown> };
type LogLine = Record<string, unknown>;

const withoutCookie = ({ text, headers }: Answer): string => {
    const { 'set-cookie': _cookie, ...rest } = headers;
    return `${text}\n${JSON.stringify(rest)}`;
};

describe('Identity keeps secrets out of answers and logs (e2e)', () => {
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
        });
    });

    beforeEach(async () => {
        await cleanDatabase(probe.app.get(DbService));
        logged = '';
    });

    afterAll(async () => {
        await probe.app.close();
    });

    it('writes no password, hash, email or session id anywhere but the cookie', async () => {
        await createAdmin(probe);
        const answers: Answer[] = [];
        const keep = <T extends Answer>(answer: T): T => {
            answers.push(answer);
            return answer;
        };

        const signedIn = keep(await signIn(probe).expect(200));
        const token = issuedCookie(signedIn)?.value ?? '';
        keep(
            await signIn(probe, {
                email: ADMIN.email,
                password: WRONG_PASSWORD,
            }).expect(401),
        );
        keep(
            await signIn(probe, {
                email: UNKNOWN_EMAIL,
                password: ADMIN.password,
            }).expect(401),
        );
        keep(
            await probe
                .http()
                .post(LOGIN_PATH)
                .send({ email: ADMIN.email, password: ADMIN.password })
                .expect(403),
        );
        keep(
            await probe
                .http()
                .post(LOGIN_PATH)
                .set('Origin', PANEL_ORIGIN)
                .send({ email: ADMIN.email, password: '' })
                .expect(400),
        );
        keep(
            await probe
                .http()
                .get(SESSION_PATH)
                .set('Cookie', cookieHeader(token))
                .expect(200),
        );
        keep(
            await probe
                .http()
                .delete(SESSION_PATH)
                .set('Origin', PANEL_ORIGIN)
                .set('Cookie', cookieHeader(token))
                .expect(204),
        );
        keep(
            await probe
                .http()
                .get(SESSION_PATH)
                .set('Cookie', cookieHeader(token))
                .expect(401),
        );
        await flush();

        const stored = await probe.app
            .get(DbService)
            .accountPassword.findFirstOrThrow();
        const secrets = [
            ADMIN.password,
            WRONG_PASSWORD,
            ADMIN.email,
            UNKNOWN_EMAIL,
            ADMIN.phone,
            ADMIN.lastName,
            token,
            createHash('sha256').update(token).digest('hex'),
            stored.hash,
            HASH_MARK,
        ];
        const answered = answers.map(withoutCookie).join('\n');
        const lines = logged
            .split('\n')
            .filter((line) => line !== '')
            .map((line) => JSON.parse(line) as LogLine);
        const events = lines.map((line) => line['event']);

        expect(token).not.toBe('');
        for (const secret of secrets) {
            expect(answered).not.toContain(secret);
            expect(logged).not.toContain(secret);
        }
        expect(
            events.filter(
                (event) =>
                    typeof event === 'string' && event.startsWith('identity.'),
            ),
        ).toEqual([
            'identity.account_created',
            'identity.signed_in',
            'identity.sign_in_failed',
            'identity.sign_in_failed',
            'identity.signed_out',
        ]);
        expect(events.filter((event) => event === 'http.request')).toHaveLength(
            answers.length,
        );
        expect(
            lines.filter((line) => typeof line['userId'] === 'string'),
        ).toHaveLength(1);
    });
});
