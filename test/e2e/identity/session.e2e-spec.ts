import type { Test } from 'supertest';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import {
    cookieHeader,
    createAdmin,
    FOREIGN_ORIGIN,
    issuedCookie,
    PANEL_ORIGIN,
    SESSION_PATH,
    signedInToken,
} from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { responseBody } from '../../utils/response-body.ts';

type SessionBody = { accountId: string; application: string };
type ErrorBody = { code: string };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const NOW = new Date('2026-10-07T09:00:00.000Z');

describe('Session (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    const readSession = (token: string): Test =>
        testApp.http().get(SESSION_PATH).set('Cookie', cookieHeader(token));

    const expectRefused = async (request: Test): Promise<void> => {
        const response = await request.expect(401);
        expect(responseBody<ErrorBody>(response).code).toBe(
            'IDENTITY_SESSION_REQUIRED',
        );
    };

    it('tells the panel who is signed in', async () => {
        const accountId = await createAdmin(testApp);
        const token = await signedInToken(testApp);

        const response = await readSession(token).expect(200);

        expect(responseBody<SessionBody>(response)).toEqual({
            accountId,
            application: 'admin_panel',
        });
        expect(issuedCookie(response)).toBeNull();
    });

    it('refuses a request without the cookie or with a value it never issued', async () => {
        await createAdmin(testApp);
        await signedInToken(testApp);

        await expectRefused(testApp.http().get(SESSION_PATH));
        await expectRefused(readSession('never-issued-value'));
    });

    it('does not accept the id of a cookie session in the Authorization header', async () => {
        await createAdmin(testApp);
        const token = await signedInToken(testApp);

        await expectRefused(
            testApp
                .http()
                .get(SESSION_PATH)
                .set('Authorization', `Bearer ${token}`),
        );
        await expectRefused(
            readSession(token).set('Authorization', `Bearer ${token}`),
        );
        await readSession(token).expect(200);
    });

    it('signs out: clears the cookie and refuses the session afterwards', async () => {
        await createAdmin(testApp);
        const token = await signedInToken(testApp);
        clock.advance(HOUR_MS);

        const response = await testApp
            .http()
            .delete(SESSION_PATH)
            .set('Origin', PANEL_ORIGIN)
            .set('Cookie', cookieHeader(token))
            .expect(204);

        expect(issuedCookie(response)).toEqual({
            value: '',
            attributes: [
                'Max-Age=0',
                'Path=/',
                'HttpOnly',
                'Secure',
                'SameSite=Lax',
            ],
        });
        await expectRefused(readSession(token));
        const [session] = await testApp.db.session.findMany();
        expect(session?.endedAt).toEqual(clock.now());
    });

    it('answers a sign-out without a session the same way', async () => {
        const response = await testApp
            .http()
            .delete(SESSION_PATH)
            .set('Origin', PANEL_ORIGIN)
            .expect(204);

        expect(issuedCookie(response)?.value).toBe('');
    });

    it('rejects a changing request that carries the cookie but not the panel origin', async () => {
        await createAdmin(testApp);
        const token = await signedInToken(testApp);

        const withoutOrigin = await testApp
            .http()
            .delete(SESSION_PATH)
            .set('Cookie', cookieHeader(token))
            .expect(403);
        const foreignOrigin = await testApp
            .http()
            .delete(SESSION_PATH)
            .set('Origin', FOREIGN_ORIGIN)
            .set('Cookie', cookieHeader(token))
            .expect(403);

        expect(responseBody<ErrorBody>(withoutOrigin).code).toBe(
            'IDENTITY_ORIGIN_FORBIDDEN',
        );
        expect(responseBody<ErrorBody>(foreignOrigin).code).toBe(
            'IDENTITY_ORIGIN_FORBIDDEN',
        );
        expect(issuedCookie(foreignOrigin)).toBeNull();
        await readSession(token).expect(200);
    });

    it('ends after thirty days without activity', async () => {
        await createAdmin(testApp);
        const token = await signedInToken(testApp);

        clock.advance(30 * DAY_MS);

        await expectRefused(readSession(token));
    });

    it('does not write the activity down more often than once a day', async () => {
        await createAdmin(testApp);
        const token = await signedInToken(testApp);
        const signedInAt = clock.now();

        clock.advance(DAY_MS - 1);
        const response = await readSession(token).expect(200);

        const [session] = await testApp.db.session.findMany();
        expect(issuedCookie(response)).toBeNull();
        expect(session?.lastActiveAt).toEqual(signedInAt);
    });

    it('slides the thirty days from the last activity and reissues the cookie', async () => {
        await createAdmin(testApp);
        const token = await signedInToken(testApp);

        clock.advance(29 * DAY_MS);
        const renewed = await readSession(token).expect(200);
        const renewedAt = clock.now();
        clock.advance(29 * DAY_MS);
        await readSession(token).expect(200);
        clock.advance(30 * DAY_MS);

        expect(issuedCookie(renewed)).toEqual({
            value: token,
            attributes: [
                'Max-Age=2592000',
                'Path=/',
                'HttpOnly',
                'Secure',
                'SameSite=Lax',
            ],
        });
        const [session] = await testApp.db.session.findMany();
        expect(session?.lastActiveAt.getTime()).toBe(
            renewedAt.getTime() + 29 * DAY_MS,
        );
        await expectRefused(readSession(token));
    });

    it('keeps the health check open', async () => {
        await testApp.http().get('/api/v1/health').expect(200);
    });
});
