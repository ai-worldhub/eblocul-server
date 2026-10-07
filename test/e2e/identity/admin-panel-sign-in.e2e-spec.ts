import { createHash } from 'node:crypto';
import { PasswordHasher } from '../../../src/core/identity/ports/password-hasher.port.ts';
import {
    accountRow,
    OUTDATED_PASSWORD,
} from '../../factories/identity.factory.ts';
import {
    ADMIN,
    createAdmin,
    FOREIGN_ORIGIN,
    issuedCookie,
    LOGIN_PATH,
    PANEL_ORIGIN,
    signIn,
} from '../../utils/admin-session.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { responseBody } from '../../utils/response-body.ts';

type SessionBody = { accountId: string; application: string };
type ErrorBody = { code: string; message: string; details?: unknown };

describe('Administration panel sign-in (e2e)', () => {
    const testApp = useTestApp();

    it('signs the administrator in and keeps the session id in the cookie only', async () => {
        const accountId = await createAdmin(testApp);

        const response = await signIn(testApp).expect(200);

        const cookie = issuedCookie(response);
        expect(responseBody<SessionBody>(response)).toEqual({
            accountId,
            application: 'admin_panel',
        });
        expect(cookie?.attributes).toEqual([
            'Max-Age=2592000',
            'Path=/',
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
        ]);
        expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(response.text).not.toContain(cookie?.value);
    });

    it('stores the fingerprint of the session id, not the id itself', async () => {
        const accountId = await createAdmin(testApp);

        const token = issuedCookie(await signIn(testApp).expect(200))?.value;

        const sessions = await testApp.db.session.findMany();
        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
            accountId,
            application: 'admin_panel',
            transport: 'cookie',
            endedAt: null,
            tokenHash: createHash('sha256')
                .update(token ?? '')
                .digest('hex'),
        });
        expect(JSON.stringify(sessions)).not.toContain(token);
    });

    it('finds the account whatever the letter case of the email', async () => {
        await createAdmin(testApp);

        await signIn(testApp, {
            email: ' Admin@Example.COM',
            password: ADMIN.password,
        }).expect(400);
        await signIn(testApp, {
            email: 'Admin@Example.COM',
            password: ADMIN.password,
        }).expect(200);
    });

    it('answers an unknown email and a wrong password the same way', async () => {
        await createAdmin(testApp);

        const wrongPassword = await signIn(testApp, {
            email: ADMIN.email,
            password: 'wrong-password-99',
        }).expect(401);
        const unknownEmail = await signIn(testApp, {
            email: 'nobody@example.com',
            password: ADMIN.password,
        }).expect(401);

        const { code, message, details } =
            responseBody<ErrorBody>(wrongPassword);
        expect({ code, message, details }).toEqual({
            code: 'IDENTITY_CREDENTIALS_INVALID',
            message: 'Email or password is incorrect',
            details: undefined,
        });
        const unknown = responseBody<ErrorBody>(unknownEmail);
        expect({
            code: unknown.code,
            message: unknown.message,
            details: unknown.details,
        }).toEqual({ code, message, details });
        expect(issuedCookie(wrongPassword)).toBeNull();
        expect(issuedCookie(unknownEmail)).toBeNull();
        expect(await testApp.db.session.count()).toBe(0);
    });

    it('checks a password for an unknown email too, so the answer takes as long', async () => {
        await createAdmin(testApp);
        const verify = vi.spyOn(testApp.app.get(PasswordHasher), 'verify');

        await signIn(testApp, {
            email: 'nobody@example.com',
            password: ADMIN.password,
        }).expect(401);

        expect(verify).toHaveBeenCalledTimes(1);
        expect(verify.mock.calls[0]?.[1]).toMatch(/^\$argon2id\$/);
    });

    it('refuses an account that has no password', async () => {
        await testApp.db.account.create({
            data: accountRow.build({ email: 'resident@example.com' }),
        });

        const response = await signIn(testApp, {
            email: 'resident@example.com',
            password: ADMIN.password,
        }).expect(401);

        expect(responseBody<ErrorBody>(response).code).toBe(
            'IDENTITY_CREDENTIALS_INVALID',
        );
    });

    it('rejects a malformed request before looking at the account', async () => {
        const response = await testApp
            .http()
            .post(LOGIN_PATH)
            .set('Origin', PANEL_ORIGIN)
            .send({ email: 'not-an-email' })
            .expect(400);

        expect(responseBody<ErrorBody>(response)).toMatchObject({
            code: 'VALIDATION_FAILED',
            details: {
                fields: [
                    { path: 'email', rules: ['isEmail'] },
                    {
                        path: 'password',
                        rules: expect.arrayContaining(['isString']) as unknown,
                    },
                ],
            },
        });
    });

    it('refuses a sign-in that does not come from the panel', async () => {
        await createAdmin(testApp);
        const credentials = { email: ADMIN.email, password: ADMIN.password };

        const withoutOrigin = await testApp
            .http()
            .post(LOGIN_PATH)
            .send(credentials)
            .expect(403);
        const foreignOrigin = await testApp
            .http()
            .post(LOGIN_PATH)
            .set('Origin', FOREIGN_ORIGIN)
            .send(credentials)
            .expect(403);

        expect(responseBody<ErrorBody>(withoutOrigin).code).toBe(
            'IDENTITY_ORIGIN_FORBIDDEN',
        );
        expect(responseBody<ErrorBody>(foreignOrigin).code).toBe(
            'IDENTITY_ORIGIN_FORBIDDEN',
        );
        expect(issuedCookie(foreignOrigin)).toBeNull();
        expect(await testApp.db.session.count()).toBe(0);
    });

    it('lets only the panel read answers that carry the cookie', async () => {
        const preflight = (origin: string): Promise<{ headers: unknown }> =>
            testApp
                .http()
                .options(LOGIN_PATH)
                .set('Origin', origin)
                .set('Access-Control-Request-Method', 'POST')
                .expect(204);

        expect((await preflight(PANEL_ORIGIN)).headers).toMatchObject({
            'access-control-allow-origin': PANEL_ORIGIN,
            'access-control-allow-credentials': 'true',
        });
        expect((await preflight(FOREIGN_ORIGIN)).headers).not.toHaveProperty(
            'access-control-allow-origin',
        );
    });

    it('rehashes a password stored with outdated parameters', async () => {
        const account = accountRow.build({ email: ADMIN.email });
        await testApp.db.account.create({
            data: {
                ...account,
                password: {
                    create: {
                        hash: OUTDATED_PASSWORD.hash,
                        changedAt: account.createdAt,
                    },
                },
            },
        });

        await signIn(testApp, {
            email: ADMIN.email,
            password: OUTDATED_PASSWORD.password,
        }).expect(200);

        const stored = await testApp.db.accountPassword.findUniqueOrThrow({
            where: { accountId: account.id },
        });
        expect(stored.hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
        expect(stored.changedAt).toEqual(account.createdAt);
        await signIn(testApp, {
            email: ADMIN.email,
            password: OUTDATED_PASSWORD.password,
        }).expect(200);
    });
});
