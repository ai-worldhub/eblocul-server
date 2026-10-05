import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        include: ['test/unit/**/*.spec.ts'],
        clearMocks: true,
        restoreMocks: true,
    },
});
