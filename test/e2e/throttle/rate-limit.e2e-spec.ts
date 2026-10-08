import type { Response } from 'supertest';
import { PasswordHasher } from '../../../src/core/identity/ports/password-hasher.port.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import {
    ADMIN,
    createAdmin,
    LOGIN_PATH,
    PANEL_ORIGIN,
    signIn,
} from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { responseBody } from '../../utils/response-body.ts';

type ErrorBody = {
    code: string;
    message: string;
    details?: Record<string, unknown>;
};

const NOW = new Date('2026-10-08T10:00:00.000Z');
const SECOND_MS = 1000;
const AUTH_BURST = 30;
const AUTH_REFILL_SECONDS = 2;
const HEALTH_PATH = '/api/v1/health';
const HEALTH_REQUESTS = 70;
const FINGERPRINT = /^[A-Za-z0-9_-]{43}$/;

describe('Rate limit by client address (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    const knock = (forwardedFor?: string): Promise<Response> => {
        const request = testApp
            .http()
            .post(LOGIN_PATH)
            .set('Origin', PANEL_ORIGIN);
        return (
            forwardedFor === undefined
                ? request
                : request.set('X-Forwarded-For', forwardedFor)
        ).send({});
    };

    const knockTimes = async (times: number): Promise<number[]> => {
        const statuses: number[] = [];
        for (let request = 0; request < times; request += 1) {
            statuses.push((await knock()).status);
        }
        return statuses;
    };

    const expectLimited = (response: Response, seconds: number): void => {
        expect(response.status).toBe(429);
        const { code, message, details } = responseBody<ErrorBody>(response);
        expect({ code, message, details }).toEqual({
            code: 'THROTTLE_RATE_LIMITED',
            message: 'Too many requests',
            details: { retryAfterSeconds: seconds },
        });
        expect(response.headers['retry-after']).toBe(String(seconds));
    };

    it('lets the burst through and answers the next request with 429 and Retry-After', async () => {
        expect(await knockTimes(AUTH_BURST)).toEqual(
            Array<number>(AUTH_BURST).fill(400),
        );

        expectLimited(await knock(), AUTH_REFILL_SECONDS);
    });

    it('gives back one request per refill time and the whole burst after a rest', async () => {
        await knockTimes(AUTH_BURST);

        clock.advance(SECOND_MS);
        expectLimited(await knock(), 1);
        clock.advance(SECOND_MS);
        expect(await knockTimes(2)).toEqual([400, 429]);

        clock.advance(AUTH_BURST * AUTH_REFILL_SECONDS * SECOND_MS);
        expect(await knockTimes(AUTH_BURST + 1)).toEqual([
            ...Array<number>(AUTH_BURST).fill(400),
            429,
        ]);
    });

    it('does not let a forged address header around the limit when no proxy is trusted', async () => {
        for (let request = 0; request < AUTH_BURST; request += 1) {
            expect((await knock(`203.0.113.${request}`)).status).toBe(400);
        }

        expectLimited(await knock('198.51.100.200'), AUTH_REFILL_SECONDS);
    });

    it('refuses a sign-in over the limit before it looks at the password', async () => {
        await createAdmin(testApp);
        await knockTimes(AUTH_BURST);
        const verify = vi.spyOn(testApp.app.get(PasswordHasher), 'verify');

        const response = await signIn(testApp, ADMIN);

        expectLimited(response, AUTH_REFILL_SECONDS);
        expect(verify).not.toHaveBeenCalled();
        expect(await testApp.db.session.count()).toBe(0);
        expect(await testApp.db.attemptSeries.count()).toBe(0);
    });

    it('keeps one row per address and stores its fingerprint, not the address', async () => {
        const startedAt = clock.now();
        await knockTimes(AUTH_BURST + 1);

        const buckets = await testApp.db.rateBucket.findMany();
        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.key).toMatch(FINGERPRINT);
        expect(JSON.stringify(buckets)).not.toContain('127.0.0.1');
        expect(buckets[0]?.fullAt).toEqual(
            new Date(
                startedAt.getTime() +
                    AUTH_BURST * AUTH_REFILL_SECONDS * SECOND_MS,
            ),
        );
    });

    it('does not limit the health check', async () => {
        for (let request = 0; request < HEALTH_REQUESTS; request += 1) {
            await testApp.http().get(HEALTH_PATH).expect(200);
        }

        expect(await testApp.db.rateBucket.count()).toBe(0);
    });
});
