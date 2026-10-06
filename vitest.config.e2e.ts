import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/e2e/**/*.e2e-spec.ts'],
        env: {
            NODE_ENV: 'e2e',
            JOBS_WORKER_CONCURRENCY: '2',
            JOBS_POLL_INTERVAL_MS: '20',
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
