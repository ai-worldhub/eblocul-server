import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { serialize } from 'cookie';
import type { ServerResponse } from 'node:http';

export const SESSION_COOKIE_NAME = 'eblocul_session';

const INSECURE = 'false';
const COOKIE_PATH = '/';

export type CookieResponse = Pick<ServerResponse, 'appendHeader'>;

@Injectable()
export class SessionCookies {
    private readonly _isSecure: boolean;

    constructor(config: ConfigService) {
        this._isSecure =
            config.get<string>('SESSION_COOKIE_SECURE') !== INSECURE;
    }

    issue(
        response: CookieResponse,
        token: string,
        maxAgeSeconds: number,
    ): void {
        this._set(response, token, maxAgeSeconds);
    }

    clear(response: CookieResponse): void {
        this._set(response, '', 0);
    }

    private _set(
        response: CookieResponse,
        value: string,
        maxAgeSeconds: number,
    ): void {
        response.appendHeader(
            'Set-Cookie',
            serialize(SESSION_COOKIE_NAME, value, {
                httpOnly: true,
                secure: this._isSecure,
                sameSite: 'lax',
                path: COOKIE_PATH,
                maxAge: maxAgeSeconds,
            }),
        );
    }
}
