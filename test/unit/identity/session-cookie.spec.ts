import { ConfigService } from '@nestjs/config';
import {
    type CookieResponse,
    SessionCookies,
} from '../../../src/core/identity/presentation/session-cookie.ts';

const THIRTY_DAYS_SECONDS = 2_592_000;

const issued = (environment: Record<string, string>): string => {
    const headers: string[] = [];
    const response: CookieResponse = {
        appendHeader(_name, value) {
            headers.push(...[value].flat());
            return this;
        },
    } as CookieResponse;
    new SessionCookies(new ConfigService(environment)).issue(
        response,
        'token-value',
        THIRTY_DAYS_SECONDS,
    );
    return headers.join('\n');
};

describe('SessionCookies', () => {
    it('hides the cookie from page scripts and sends it over HTTPS only', () => {
        expect(issued({})).toBe(
            'eblocul_session=token-value; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax',
        );
        expect(issued({ SESSION_COOKIE_SECURE: 'true' })).toContain('; Secure');
    });

    it('drops the HTTPS requirement only when the environment says so', () => {
        const cookie = issued({ SESSION_COOKIE_SECURE: 'false' });

        expect(cookie).not.toContain('Secure');
        expect(cookie).toContain('HttpOnly');
    });
});
