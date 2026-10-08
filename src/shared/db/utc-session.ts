import type { Tx } from './tx.ts';

const OPTIONS_PARAMETER = 'options';
const UTC_OPTION = '-c timezone=UTC';
const SESSION_TIME_ZONE = 'UTC';

type SessionSettings = { timeZone: string };

export const withUtcSession = (databaseUrl: string): string => {
    const url = new URL(databaseUrl);
    const given = url.searchParams.get(OPTIONS_PARAMETER);
    url.searchParams.set(
        OPTIONS_PARAMETER,
        given === null ? UTC_OPTION : `${given} ${UTC_OPTION}`,
    );
    return url.toString();
};

export const assertUtcSession = async (
    session: Pick<Tx, '$queryRaw'>,
): Promise<void> => {
    const rows = await session.$queryRaw<SessionSettings[]>`
        SELECT current_setting('TimeZone') AS "timeZone"
    `;
    const timeZone = rows[0]?.timeZone ?? 'unknown';
    if (timeZone !== SESSION_TIME_ZONE) {
        throw new Error(
            `Database session time zone must be ${SESSION_TIME_ZONE}, got ${timeZone}`,
        );
    }
};
