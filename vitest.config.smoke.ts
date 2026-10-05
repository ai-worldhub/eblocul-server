import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/smoke/**/*.smoke-spec.ts'],
        env: { NODE_ENV: 'lab' },
        fileParallelism: false,
        testTimeout: 900_000,
        hookTimeout: 60_000,
    },
});
