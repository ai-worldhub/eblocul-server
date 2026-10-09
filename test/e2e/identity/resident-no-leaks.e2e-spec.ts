import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Response } from 'supertest';
import { IdentityModule } from '../../../src/core/identity/index.ts';
import { ClockModule } from '../../../src/shared/clock/clock.module.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { DbModule } from '../../../src/shared/db/db.module.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { IdsModule } from '../../../src/shared/ids/ids.module.ts';
import { SESSION_PATH } from '../../utils/admin-session.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';
import {
    bearer,
    codeDoubles,
    confirmCode,
    CONSENT_VERSION,
    loginBodyOf,
    REGISTRATION_PATH,
    requestCode,
    sessionBodyOf,
} from '../../utils/resident-session.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const MINUTE_MS = 60_000;
const FLUSH_MS = 20;
const WRONG_CODE = '987654';
const PERSON = {
    firstName: 'Zamfira',
    lastName: 'Brancoveanu',
    phone: '+37369000001',
    writtenPhone: '069 000 001',
    nationalPhone: '69000001',
} as const;
const FOREIGN_PHONE = '+40721234567';

type LogLine = Record<string, unknown>;

const fingerprintOf = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

const textOf = ({ text, headers }: Response): string =>
    `${text}\n${JSON.stringify(headers)}`;

describe('Resident sign-in keeps the phone, the code and the session id out of answers and logs (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const doubles = codeDoubles();
    let logged = '';
    let probe: ProbeApp;

    const flush = (): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, FLUSH_MS));

    beforeAll(async () => {
        probe = await createProbeApp([], {
            logs: new Writable({
                write: (chunk: Buffer, _encoding, callback) => {
                    logged += chunk.toString();
                    callback();
                },
            }),
            imports: [DbModule, ClockModule, IdsModule, IdentityModule],
            overrides: (builder) =>
                doubles
                    .override(builder)
                    .overrideProvider(Clock)
                    .useValue(clock),
        });
    });

    beforeEach(async () => {
        await cleanDatabase(probe.app.get(DbService));
        logged = '';
    });

    afterAll(async () => {
        await probe.app.close();
    });

    it('returns the session id in the sign-in answer only and writes no phone, code, name or token to the log', async () => {
        const answers: Response[] = [];
        const keep = (answer: Response): Response => {
            answers.push(answer);
            return answer;
        };

        keep(await requestCode(probe, PERSON.writtenPhone).expect(200));
        keep(await requestCode(probe, PERSON.phone).expect(429));
        keep(await requestCode(probe, FOREIGN_PHONE).expect(400));
        keep(await confirmCode(probe, PERSON.phone, WRONG_CODE).expect(401));
        const firstCode = doubles.sender.lastCodeFor(PERSON.phone);
        const confirmed = keep(
            await confirmCode(probe, PERSON.writtenPhone, firstCode).expect(
                200,
            ),
        );
        const pendingToken = loginBodyOf(confirmed).pending?.token ?? '';
        const registered = keep(
            await probe
                .http()
                .post(REGISTRATION_PATH)
                .send({
                    pendingToken,
                    consentVersion: CONSENT_VERSION,
                    firstName: PERSON.firstName,
                    lastName: PERSON.lastName,
                })
                .expect(201),
        );
        const firstToken = sessionBodyOf(registered).token;
        keep(
            await probe
                .http()
                .get(SESSION_PATH)
                .set('Authorization', bearer(firstToken))
                .expect(200),
        );
        keep(
            await probe
                .http()
                .delete(SESSION_PATH)
                .set('Authorization', bearer(firstToken))
                .expect(204),
        );
        keep(
            await probe
                .http()
                .get(SESSION_PATH)
                .set('Authorization', bearer(firstToken))
                .expect(401),
        );
        clock.advance(MINUTE_MS);
        keep(await requestCode(probe, PERSON.phone).expect(200));
        const secondCode = doubles.sender.lastCodeFor(PERSON.phone);
        const signedIn = keep(
            await confirmCode(probe, PERSON.phone, secondCode).expect(200),
        );
        const secondToken = loginBodyOf(signedIn).session?.token ?? '';
        for (let attempt = 0; attempt < 5; attempt += 1) {
            keep(await confirmCode(probe, PERSON.phone, WRONG_CODE));
        }
        await flush();

        const personal = [
            PERSON.phone,
            PERSON.writtenPhone,
            PERSON.nationalPhone,
            FOREIGN_PHONE,
            PERSON.firstName,
            PERSON.lastName,
            firstCode,
            secondCode,
            WRONG_CODE,
        ];
        const tokens = [pendingToken, firstToken, secondToken];
        const fingerprints = tokens.map(fingerprintOf);
        const lines = logged
            .split('\n')
            .filter((line) => line !== '')
            .map((line) => JSON.parse(line) as LogLine);
        const events = lines.map((line) => line['event']);

        expect(tokens.every((token) => token !== '')).toBe(true);
        expect(secondCode).not.toBe(firstCode);
        for (const secret of [...personal, ...tokens, ...fingerprints]) {
            expect(logged).not.toContain(secret);
        }
        for (const answer of answers) {
            for (const secret of [...personal, ...fingerprints]) {
                expect(textOf(answer)).not.toContain(secret);
            }
        }
        for (const [token, issuedIn] of [
            [pendingToken, confirmed],
            [firstToken, registered],
            [secondToken, signedIn],
        ] as const) {
            expect(
                answers.filter((answer) => textOf(answer).includes(token)),
            ).toEqual([issuedIn]);
        }
        expect(
            events.filter(
                (event) =>
                    typeof event === 'string' && event.startsWith('identity.'),
            ),
        ).toEqual([
            'identity.code_sent',
            'identity.sign_in_failed',
            'identity.code_confirmed',
            'identity.account_created',
            'identity.consent_accepted',
            'identity.signed_in',
            'identity.signed_out',
            'identity.code_sent',
            'identity.code_confirmed',
            'identity.signed_in',
            'identity.sign_in_failed',
            'identity.sign_in_failed',
            'identity.sign_in_failed',
            'identity.sign_in_failed',
            'identity.sign_in_failed',
        ]);
        expect(events.filter((event) => event === 'http.request')).toHaveLength(
            answers.length,
        );
        expect(
            lines.filter((line) => typeof line['userId'] === 'string'),
        ).toHaveLength(1);

        const stored = JSON.stringify({
            codes: await probe.app.get(DbService).phoneCode.findMany(),
            pendings: await probe.app.get(DbService).pendingSignIn.findMany(),
            sessions: await probe.app.get(DbService).session.findMany(),
        });
        for (const secret of [firstCode, secondCode, ...tokens]) {
            expect(stored).not.toContain(secret);
        }
    });
});
