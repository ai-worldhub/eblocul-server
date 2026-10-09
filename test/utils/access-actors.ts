import type { Test } from 'supertest';
import { SessionService } from '../../src/core/identity/application/services/session.service.ts';
import type { SessionApplication } from '../../src/core/identity/index.ts';
import { ACCESS_GRANT_HEADER } from '../../src/core/authz/index.ts';
import { Transactions } from '../../src/shared/db/transactions.service.ts';
import { cookieHeader, PANEL_ORIGIN } from './admin-session.ts';
import type { ProbeApp } from './probe-app.ts';

const API = '/api/v1';
const HEADER_APPLICATION: SessionApplication = 'resident_app';

export type Actor = {
    accountId: string;
    application: SessionApplication;
    token: string;
};

type Sender = Pick<ProbeApp, 'app' | 'http'>;

export type Method = 'get' | 'post' | 'patch' | 'delete';

export const signedInAs = async (
    target: Pick<ProbeApp, 'app'>,
    accountId: string,
    application: SessionApplication,
): Promise<Actor> => {
    const { token } = await target.app
        .get(Transactions)
        .run((tx) =>
            target.app
                .get(SessionService)
                .start(tx, { accountId, application }),
        );
    return { accountId, application, token };
};

const sessionHeaders = (actor: Actor): Record<string, string> =>
    actor.application === HEADER_APPLICATION
        ? { Authorization: `Bearer ${actor.token}` }
        : { Cookie: cookieHeader(actor.token), Origin: PANEL_ORIGIN };

export const sendAs = (
    target: Sender,
    actor: Actor,
    grantId: string | null,
    method: Method,
    path: string,
): Test =>
    target
        .http()
        [method](`${API}${path}`)
        .set({
            ...sessionHeaders(actor),
            ...(grantId === null ? {} : { [ACCESS_GRANT_HEADER]: grantId }),
        });
