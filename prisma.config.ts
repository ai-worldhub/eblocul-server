import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

const nodeEnv = process.env['NODE_ENV'] ?? 'lab';
const envFiles =
    nodeEnv === 'e2e' ? ['.env.e2e'] : ['.env.local', `.env.${nodeEnv}`];

for (const file of envFiles.filter((path) => existsSync(path))) {
    process.loadEnvFile(file);
}

const OPTIONS_PARAMETER = 'options';
const UTC_OPTION = '-c timezone=UTC';

const withUtcSession = (databaseUrl: string): string => {
    if (!URL.canParse(databaseUrl)) {
        return databaseUrl;
    }
    const url = new URL(databaseUrl);
    const given = url.searchParams.get(OPTIONS_PARAMETER);
    url.searchParams.set(
        OPTIONS_PARAMETER,
        given === null ? UTC_OPTION : `${given} ${UTC_OPTION}`,
    );
    return url.toString();
};

export default defineConfig({
    schema: 'prisma/schema',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: withUtcSession(process.env['DATABASE_URL'] ?? ''),
    },
});
