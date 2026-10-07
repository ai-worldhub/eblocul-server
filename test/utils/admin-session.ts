import type { Response, Test } from 'supertest';
import { AccountService } from '../../src/core/identity/application/account.service.ts';
import type { TestApp } from './test-app.factory.ts';

export const PANEL_ORIGIN = 'https://panel.eblocul.invalid';
export const FOREIGN_ORIGIN = 'https://evil.example.com';
export const LOGIN_PATH = '/api/v1/auth/admin-panel/login';
export const SESSION_PATH = '/api/v1/me/session';

const SESSION_COOKIE = 'eblocul_session';

export const ADMIN = {
    firstName: 'Test',
    lastName: 'Administrator',
    phone: '+37300000001',
    email: 'admin@example.com',
    password: 'correct-horse-42',
} as const;

export type Credentials = { email: string; password: string };

export type IssuedCookie = { value: string; attributes: string[] };

export const createAdmin = (testApp: TestApp): Promise<string> =>
    testApp.app.get(AccountService).createWithPassword(ADMIN);

export const signIn = (
    testApp: TestApp,
    credentials: Credentials = ADMIN,
): Test =>
    testApp.http().post(LOGIN_PATH).set('Origin', PANEL_ORIGIN).send({
        email: credentials.email,
        password: credentials.password,
    });

export const issuedCookie = (response: Response): IssuedCookie | null => {
    const cookies: string[] | undefined = response.get('Set-Cookie');
    const header = (cookies ?? []).find((cookie) =>
        cookie.startsWith(`${SESSION_COOKIE}=`),
    );
    if (header === undefined) {
        return null;
    }
    const [pair = '', ...attributes] = header.split('; ');
    return { value: pair.slice(SESSION_COOKIE.length + 1), attributes };
};

export const cookieHeader = (token: string): string =>
    `${SESSION_COOKIE}=${token}`;

export const signedInToken = async (testApp: TestApp): Promise<string> => {
    const cookie = issuedCookie(await signIn(testApp).expect(200));
    if (cookie === null) {
        throw new Error('Sign-in set no session cookie');
    }
    return cookie.value;
};
