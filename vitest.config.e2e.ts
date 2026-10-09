import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/e2e/**/*.e2e-spec.ts'],
        env: {
            NODE_ENV: 'e2e',
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
