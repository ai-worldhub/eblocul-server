import { withUtcSession } from '../../../src/shared/db/utc-session.ts';

const optionsOf = (databaseUrl: string): string | null =>
    new URL(databaseUrl).searchParams.get('options');

describe('withUtcSession', () => {
    it('asks the server for a UTC session', () => {
        const url = withUtcSession(
            'postgresql://user:pass@db.invalid:5432/eblocul',
        );

        expect(optionsOf(url)).toBe('-c timezone=UTC');
    });

    it('puts UTC after the options the address already carries', () => {
        const url = withUtcSession(
            'postgresql://user:pass@db.invalid:5432/eblocul?options=-c%20timezone%3DAsia%2FTokyo%20-c%20statement_timeout%3D5000',
        );

        expect(optionsOf(url)).toBe(
            '-c timezone=Asia/Tokyo -c statement_timeout=5000 -c timezone=UTC',
        );
    });

    it('leaves the rest of the address as it was', () => {
        const url = new URL(
            withUtcSession(
                'postgresql://user:p%40ss%2Fword@db.invalid:6432/eblocul?schema=public',
            ),
        );

        expect(url.username).toBe('user');
        expect(url.password).toBe('p%40ss%2Fword');
        expect(url.host).toBe('db.invalid:6432');
        expect(url.pathname).toBe('/eblocul');
        expect(url.searchParams.get('schema')).toBe('public');
    });
});
