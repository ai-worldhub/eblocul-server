import type { Test } from 'supertest';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import {
    cookieHeader,
    createAdmin,
    issuedCookie,
    SESSION_PATH,
    signedInToken,
} from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import {
    bearer,
    codeDoubles,
    confirmSentCode,
    registerResident,
    RESIDENT,
} from '../../utils/resident-session.ts';
import { responseBody } from '../../utils/response-body.ts';

type SessionBody = { accountId: string; application: string };
type ErrorBody = { code: string };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const NOW = new Date('2026-10-09T09:00:00.000Z');

describe('Session of the resident application (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const doubles = codeDoubles();
    const testApp = useTestApp((builder) =>
        doubles.override(builder).overrideProvider(Clock).useValue(clock),
    );

    beforeEach(() => {
        clock.advance(NOW.getTime() - clock.now().getTime());
        doubles.reset();
    });

    const readSession = (token: string): Test =>
        testApp.http().get(SESSION_PATH).set('Authorization', bearer(token));

    const expectRefused = async (request: Test): Promise<void> => {
        const response = await request.expect(401);
        expect(responseBody<ErrorBody>(response).code).toBe(
            'IDENTITY_SESSION_REQUIRED',
        );
    };

    it('accepts the session id in the Authorization header', async () => {
        const session = await registerResident(testApp, doubles);

        const response = await readSession(session.token).expect(200);

        expect(responseBody<SessionBody>(response)).toEqual({
            accountId: session.accountId,
            application: 'resident_app',
        });
        expect(issuedCookie(response)).toBeNull();
    });

    it('refuses a request without the header or with a value it never issued', async () => {
        await registerResident(testApp, doubles);

        await expectRefused(testApp.http().get(SESSION_PATH));
        await expectRefused(readSession('never-issued-value'));
        await expectRefused(
            testApp
                .http()
                .get(SESSION_PATH)
                .set('Authorization', 'never-issued-value'),
        );
    });

    it('does not accept the id of a resident session in the cookie', async () => {
        const session = await registerResident(testApp, doubles);

        await expectRefused(
            testApp
                .http()
                .get(SESSION_PATH)
                .set('Cookie', cookieHeader(session.token)),
        );
        await expectRefused(
            readSession(session.token).set(
                'Cookie',
                cookieHeader(session.token),
            ),
        );
        await readSession(session.token).expect(200);
    });

    it('does not accept the id of an administrator session in the header', async () => {
        await createAdmin(testApp);
        const panelToken = await signedInToken(testApp);

        await expectRefused(readSession(panelToken));
        await testApp
            .http()
            .get(SESSION_PATH)
            .set('Cookie', cookieHeader(panelToken))
            .expect(200);
    });

    it('signs out: the session is refused afterwards', async () => {
        const session = await registerResident(testApp, doubles);
        clock.advance(HOUR_MS);

        await testApp
            .http()
            .delete(SESSION_PATH)
            .set('Authorization', bearer(session.token))
            .expect(204);

        await expectRefused(readSession(session.token));
        const [stored] = await testApp.db.session.findMany();
        expect(stored?.endedAt).toEqual(clock.now());
    });

    it('signs out one device and keeps the other signed in', async () => {
        const first = await registerResident(testApp, doubles);
        clock.advance(MINUTE_MS);
        const second = await confirmSentCode(testApp, doubles, RESIDENT.phone);

        await testApp
            .http()
            .delete(SESSION_PATH)
            .set('Authorization', bearer(first.token))
            .expect(204);

        await expectRefused(readSession(first.token));
        await readSession(second.session?.token ?? '').expect(200);
    });

    it('ends after ninety days without activity', async () => {
        const session = await registerResident(testApp, doubles);

        clock.advance(90 * DAY_MS - 1);
        const stillOpen = await registerResident(testApp, doubles, {
            firstName: 'Ana',
            lastName: 'Rusu',
            writtenPhone: '079 000 002',
        });
        clock.advance(1);

        await expectRefused(readSession(session.token));
        await readSession(stillOpen.token).expect(200);
    });

    it('slides the ninety days from the last activity and writes it down at most once a day', async () => {
        const session = await registerResident(testApp, doubles);
        const signedInAt = clock.now();

        clock.advance(DAY_MS - 1);
        await readSession(session.token).expect(200);
        const [untouched] = await testApp.db.session.findMany();
        clock.advance(89 * DAY_MS);
        await readSession(session.token).expect(200);
        const renewedAt = clock.now();
        clock.advance(90 * DAY_MS - 1);
        await readSession(session.token).expect(200);
        clock.advance(90 * DAY_MS);

        expect(untouched?.lastActiveAt).toEqual(signedInAt);
        const [stored] = await testApp.db.session.findMany();
        expect(stored?.lastActiveAt.getTime()).toBe(
            renewedAt.getTime() + 90 * DAY_MS - 1,
        );
        await expectRefused(readSession(session.token));
    });
});
