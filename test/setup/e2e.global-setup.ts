import { execFileSync } from 'node:child_process';

const setup = (): void => {
    execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'e2e' },
    });
};

export default setup;
