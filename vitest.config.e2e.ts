import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

const E2E_ENV_FILE = '.env.e2e';

const fromEnvFile = (): string | undefined =>
    existsSync(E2E_ENV_FILE)
        ? parseEnv(readFileSync(E2E_ENV_FILE, 'utf8'))['DATABASE_URL']
        : undefined;

const e2eDatabaseUrl = (): string => {
    const url = process.env['DATABASE_URL'] ?? fromEnvFile();
    if (url === undefined || url === '') {
        throw new Error(
            `e2e tests need DATABASE_URL: export it or put it into ${E2E_ENV_FILE}`,
        );
    }
    return url;
};

export default defineConfig({
    test: {
        globals: true,
        include: ['test/e2e/**/*.e2e-spec.ts'],
        env: {
            NODE_ENV: 'e2e',
            DATABASE_URL: e2eDatabaseUrl(),
            JOBS_WORKER_CONCURRENCY: '2',
            JOBS_POLL_INTERVAL_MS: '20',
            WEB_PANEL_ORIGINS: 'https://panel.eblocul.invalid',
            SEED_ADMIN_PASSWORD: 'e2e-password-not-real-1',
            TRUSTED_PROXY_HOPS: '0',
            THROTTLE_KEY_SECRET: 'e2e-secret-not-a-real-key-0123456789',
            LEGAL_CONSENT_VERSION: 'e2e-version-1',
            MAIL_SMTP_HOST: 'mailpit.invalid',
            MAIL_SMTP_PORT: '1025',
            MAIL_FROM: 'no-reply@eblocul.invalid',
        },
        globalSetup: ['test/setup/e2e.global-setup.ts'],
        fileParallelism: false,
        hookTimeout: 30_000,
        clearMocks: true,
        restoreMocks: true,
    },
});
