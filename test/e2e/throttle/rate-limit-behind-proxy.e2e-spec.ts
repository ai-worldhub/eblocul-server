import type { Response } from 'supertest';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { LOGIN_PATH, PANEL_ORIGIN } from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { responseBody } from '../../utils/response-body.ts';

vi.hoisted(() => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
});

type ErrorBody = { code: string };

const NOW = new Date('2026-10-08T10:00:00.000Z');
const AUTH_BURST = 30;

describe('Rate limit behind one trusted proxy (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    afterAll(() => {
        vi.unstubAllEnvs();
    });

    const knock = (forwardedFor: string): Promise<Response> =>
        testApp
            .http()
            .post(LOGIN_PATH)
            .set('Origin', PANEL_ORIGIN)
            .set('X-Forwarded-For', forwardedFor)
            .send({});

    const exhaust = async (forwardedFor: string): Promise<void> => {
        for (let request = 0; request < AUTH_BURST; request += 1) {
            expect((await knock(forwardedFor)).status).toBe(400);
        }
        const refused = await knock(forwardedFor);
        expect(refused.status).toBe(429);
        expect(responseBody<ErrorBody>(refused).code).toBe(
            'THROTTLE_RATE_LIMITED',
        );
    };

    it('limits one address and leaves requests from another address alone', async () => {
        await exhaust('203.0.113.7');

        expect((await knock('203.0.113.8')).status).toBe(400);
        expect((await knock('203.0.113.7')).status).toBe(429);
        expect(await testApp.db.rateBucket.count()).toBe(2);
    });

    it('takes the address the proxy wrote, not the one the client put before it', async () => {
        await exhaust('203.0.113.7');

        expect((await knock('198.51.100.1, 203.0.113.7')).status).toBe(429);
        expect((await knock('203.0.113.7, 198.51.100.1')).status).toBe(400);
    });

    it('counts a whole IPv6 /64 as one client', async () => {
        await exhaust('2001:db8:1:2::1');

        expect((await knock('2001:db8:1:2:ffff:ffff:ffff:9')).status).toBe(429);
        expect((await knock('2001:db8:1:3::1')).status).toBe(400);
        expect(await testApp.db.rateBucket.count()).toBe(2);
    });
});
