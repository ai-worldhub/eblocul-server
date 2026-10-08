import 'reflect-metadata';
import { validateEnv } from '../../../src/shared/configs/env.validation.ts';

const VALID = {
    NODE_ENV: 'lab',
    DATABASE_URL: 'postgresql://user:pass@db.invalid:5432/eblocul',
    WEB_PANEL_ORIGINS: 'https://panel.eblocul.invalid',
    MAIL_SMTP_HOST: 'mailpit.invalid',
    MAIL_FROM: 'no-reply@eblocul.invalid',
    TRUSTED_PROXY_HOPS: '0',
    THROTTLE_KEY_SECRET: 'unit-secret-not-a-real-key-0123456789',
};

describe('validateEnv', () => {
    it('sends the session cookie over HTTPS only unless told otherwise', () => {
        expect(validateEnv(VALID).SESSION_COOKIE_SECURE).toBe('true');
        expect(
            validateEnv({ ...VALID, SESSION_COOKIE_SECURE: 'false' })
                .SESSION_COOKIE_SECURE,
        ).toBe('false');
    });

    it('refuses to start production with an insecure session cookie', () => {
        expect(() =>
            validateEnv({
                ...VALID,
                NODE_ENV: 'production',
                SESSION_COOKIE_SECURE: 'false',
            }),
        ).toThrow('SESSION_COOKIE_SECURE: must be true in production');
        expect(
            validateEnv({ ...VALID, NODE_ENV: 'production' })
                .SESSION_COOKIE_SECURE,
        ).toBe('true');
    });

    it('refuses to start production with a panel origin that is not https', () => {
        expect(() =>
            validateEnv({
                ...VALID,
                NODE_ENV: 'production',
                WEB_PANEL_ORIGINS:
                    'https://panel.eblocul.invalid,http://localhost:5173',
            }),
        ).toThrow('WEB_PANEL_ORIGINS: must be https in production');
    });

    it('accepts only a list of exact panel origins', () => {
        expect(
            validateEnv({
                ...VALID,
                WEB_PANEL_ORIGINS:
                    'https://panel.eblocul.invalid,http://localhost:5173',
            }).WEB_PANEL_ORIGINS,
        ).toBe('https://panel.eblocul.invalid,http://localhost:5173');
        for (const origins of [
            '',
            '*',
            'panel.eblocul.invalid',
            'https://panel.eblocul.invalid/',
            'https://panel.eblocul.invalid, http://localhost:5173',
        ]) {
            expect(() =>
                validateEnv({ ...VALID, WEB_PANEL_ORIGINS: origins }),
            ).toThrow('WEB_PANEL_ORIGINS');
        }
        for (const origins of [
            'https://Panel.Eblocul.invalid',
            'https://panel.eblocul.invalid:443',
            'https://*.eblocul.invalid',
            'https://user:pass@panel.eblocul.invalid',
            'https://panel.eblocul.invalid?x=1',
        ]) {
            expect(() =>
                validateEnv({ ...VALID, WEB_PANEL_ORIGINS: origins }),
            ).toThrow('WEB_PANEL_ORIGINS: each origin must be exact');
        }
        const { WEB_PANEL_ORIGINS: _omitted, ...withoutOrigins } = VALID;
        expect(() => validateEnv(withoutOrigins)).toThrow('WEB_PANEL_ORIGINS');
    });

    it('refuses to start until it is told how many proxies stand in front', () => {
        const { TRUSTED_PROXY_HOPS: _omitted, ...withoutHops } = VALID;

        expect(() => validateEnv(withoutHops)).toThrow('TRUSTED_PROXY_HOPS');
        expect(() =>
            validateEnv({ ...withoutHops, NODE_ENV: 'production' }),
        ).toThrow('TRUSTED_PROXY_HOPS');
        for (const hops of ['', '-1', '1.5', 'one', '9']) {
            expect(() =>
                validateEnv({ ...VALID, TRUSTED_PROXY_HOPS: hops }),
            ).toThrow('TRUSTED_PROXY_HOPS');
        }
        expect(validateEnv(VALID).TRUSTED_PROXY_HOPS).toBe(0);
        expect(
            validateEnv({ ...VALID, TRUSTED_PROXY_HOPS: '2' })
                .TRUSTED_PROXY_HOPS,
        ).toBe(2);
    });

    it('refuses to start without a long enough key for the limit fingerprints', () => {
        const { THROTTLE_KEY_SECRET: _omitted, ...withoutSecret } = VALID;

        expect(() => validateEnv(withoutSecret)).toThrow('THROTTLE_KEY_SECRET');
        expect(() =>
            validateEnv({ ...VALID, THROTTLE_KEY_SECRET: 'too-short' }),
        ).toThrow('THROTTLE_KEY_SECRET');
    });
});
