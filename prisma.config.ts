import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

const nodeEnv = process.env['NODE_ENV'] ?? 'lab';
const envFiles =
    nodeEnv === 'e2e' ? ['.env.e2e'] : ['.env.local', `.env.${nodeEnv}`];

for (const file of envFiles.filter((path) => existsSync(path))) {
    process.loadEnvFile(file);
}

export default defineConfig({
    schema: 'prisma/schema',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: process.env['DATABASE_URL'] ?? '',
    },
});
