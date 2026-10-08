import { parse } from 'cookie';
import type { IncomingHttpHeaders } from 'node:http';
import type { PresentedSession } from '../../application/session.service.ts';
import { sessionRequired } from '../../domain/session.entity.ts';
import { SESSION_COOKIE_NAME } from './session-cookie.ts';

const BEARER = /^Bearer (\S+)$/;

export const sessionCookieOf = (
    headers: IncomingHttpHeaders,
): string | null => {
    const value = parse(headers.cookie ?? '')[SESSION_COOKIE_NAME];
    return value === undefined || value === '' ? null : value;
};

const bearerOf = (headers: IncomingHttpHeaders): string | null =>
    BEARER.exec(headers.authorization ?? '')?.[1] ?? null;

export const presentedSessionOf = (
    headers: IncomingHttpHeaders,
): PresentedSession | null => {
    const cookie = sessionCookieOf(headers);
    const bearer = bearerOf(headers);
    if (cookie !== null && bearer !== null) {
        throw sessionRequired();
    }
    if (cookie !== null) {
        return { token: cookie, transport: 'cookie' };
    }
    return bearer === null ? null : { token: bearer, transport: 'header' };
};
