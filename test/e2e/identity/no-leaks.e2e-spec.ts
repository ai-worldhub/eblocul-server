import { createHash } from 'node:crypto';
import { EventLogger } from '../../../src/shared/logging/event-logger.ts';
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
import { useTestApp } from '../../utils/e2e-setup.ts';
import { EventLoggerDouble } from '../../utils/event-logger.double.ts';

const WRONG_PASSWORD = 'wrong-password-99';
const UNKNOWN_EMAIL = 'nobody@example.com';
const HASH_MARK = '$argon2';

type Answer = { text: string; headers: Record<string, unknown> };

const withoutCookie = ({ text, headers }: Answer): string => {
    const { 'set-cookie': _cookie, ...rest } = headers;
    return `${text}\n${JSON.stringify(rest)}`;
};

describe('Identity keeps secrets out of answers and logs (e2e)', () => {
    const events = new EventLoggerDouble();
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(EventLogger).useValue(events),
    );

    it('writes no password, hash, email or session id anywhere but the cookie', async () => {
        await createAdmin(testApp);
        const answers: Answer[] = [];
        const keep = <T extends Answer>(answer: T): T => {
            answers.push(answer);
            return answer;
        };

        const signedIn = keep(await signIn(testApp).expect(200));
        const token = issuedCookie(signedIn)?.value ?? '';
        keep(
            await signIn(testApp, {
                email: ADMIN.email,
                password: WRONG_PASSWORD,
            }).expect(401),
        );
        keep(
            await signIn(testApp, {
                email: UNKNOWN_EMAIL,
                password: ADMIN.password,
            }).expect(401),
        );
        keep(
            await testApp
                .http()
                .post(LOGIN_PATH)
                .send({ email: ADMIN.email, password: ADMIN.password })
                .expect(403),
        );
        keep(
            await testApp
                .http()
                .post(LOGIN_PATH)
                .set('Origin', PANEL_ORIGIN)
                .send({ email: ADMIN.email, password: '' })
                .expect(400),
        );
        keep(
            await testApp
                .http()
                .get(SESSION_PATH)
                .set('Cookie', cookieHeader(token))
                .expect(200),
        );
        keep(
            await testApp
                .http()
                .delete(SESSION_PATH)
                .set('Origin', PANEL_ORIGIN)
                .set('Cookie', cookieHeader(token))
                .expect(204),
        );
        keep(
            await testApp
                .http()
                .get(SESSION_PATH)
                .set('Cookie', cookieHeader(token))
                .expect(401),
        );

        const stored = await testApp.db.accountPassword.findFirstOrThrow();
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
        const logged = JSON.stringify(events.records);

        expect(token).not.toBe('');
        for (const secret of secrets) {
            expect(answered).not.toContain(secret);
            expect(logged).not.toContain(secret);
        }
        expect(events.records.map(({ event }) => event)).toEqual([
            'identity.account_created',
            'identity.signed_in',
            'identity.sign_in_failed',
            'identity.sign_in_failed',
            'identity.signed_out',
        ]);
    });
});
