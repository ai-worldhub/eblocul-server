import { createHash } from 'node:crypto';
import type { Response, Test } from 'supertest';
import { ResidentSignInService } from '../../../src/core/identity/application/services/resident-sign-in.service.ts';
import { PendingSignInRepository } from '../../../src/core/identity/ports/pending-sign-in.repository.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { Transactions } from '../../../src/shared/db/transactions.service.ts';
import { accountRow } from '../../factories/identity.factory.ts';
import {
    ADMIN,
    cookieHeader,
    createAdmin,
    SESSION_PATH,
    signedInToken,
} from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { runOverlapped } from '../../utils/overlapped-transactions.ts';
import {
    bearer,
    codeDoubles,
    CODES_PATH,
    confirmCode,
    confirmSentCode,
    CONSENT_PATH,
    CONSENT_VERSION,
    loginBodyOf,
    REGISTRATION_PATH,
    registerResident,
    requestCode,
    RESIDENT,
    sessionBodyOf,
} from '../../utils/resident-session.ts';
import { responseBody } from '../../utils/response-body.ts';

type ErrorBody = {
    code: string;
    message: string;
    details?: { retryAfterSeconds?: number; fields?: unknown };
};
type CodeBody = { resendAfterSeconds: number; expiresInSeconds: number };

const NOW = new Date('2026-10-09T09:00:00.000Z');
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const WRONG_CODE = '999999';
const UNKNOWN_PHONE = '+37379000009';
const ACCESS_PATH = '/api/v1/me/access';

describe('Resident sign-in by phone (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const doubles = codeDoubles();
    const testApp = useTestApp((builder) =>
        doubles.override(builder).overrideProvider(Clock).useValue(clock),
    );

    beforeEach(() => {
        clock.advance(NOW.getTime() - clock.now().getTime());
        doubles.reset();
    });

    const errorOf = (response: Response): ErrorBody =>
        responseBody<ErrorBody>(response);

    const finish = (path: string, body: Record<string, string>): Test =>
        testApp.http().post(path).send(body);

    const registration = (
        pendingToken: string,
        consentVersion: string = CONSENT_VERSION,
    ): Test =>
        finish(REGISTRATION_PATH, {
            pendingToken,
            consentVersion,
            firstName: RESIDENT.firstName,
            lastName: RESIDENT.lastName,
        });

    it('registers a resident: code, name and consent, then a session; the account appears only after the consent', async () => {
        const requested = await requestCode(
            testApp,
            RESIDENT.writtenPhone,
        ).expect(200);

        expect(responseBody<CodeBody>(requested)).toEqual({
            resendAfterSeconds: 60,
            expiresInSeconds: 600,
        });
        expect(doubles.sender.sent()).toEqual([
            { phone: RESIDENT.phone, code: '111111', language: 'ro' },
        ]);
        expect(await testApp.db.account.count()).toBe(0);

        clock.advance(MINUTE_MS);
        const confirmedAt = clock.now();
        const confirmed = loginBodyOf(
            await confirmCode(testApp, RESIDENT.writtenPhone, '111111').expect(
                200,
            ),
        );

        expect(confirmed).toEqual({
            outcome: 'registration_required',
            session: null,
            pending: {
                token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
                expiresInSeconds: 1800,
                consentVersion: CONSENT_VERSION,
            },
        });
        expect(await testApp.db.account.count()).toBe(0);
        expect(await testApp.db.session.count()).toBe(0);
        expect(await testApp.db.phoneCode.count()).toBe(0);
        expect(await testApp.db.pendingSignIn.count()).toBe(1);

        clock.advance(MINUTE_MS);
        const registered = await registration(
            confirmed.pending?.token ?? '',
        ).expect(201);

        const session = sessionBodyOf(registered);
        const [account] = await testApp.db.account.findMany({
            include: { consents: true, sessions: true, password: true },
        });
        expect(await testApp.db.account.count()).toBe(1);
        expect(account).toMatchObject({
            id: session.accountId,
            firstName: RESIDENT.firstName,
            lastName: RESIDENT.lastName,
            phone: RESIDENT.phone,
            email: null,
            language: 'ro',
            createdAt: clock.now(),
            phoneVerifiedAt: confirmedAt,
            password: null,
            consents: [{ version: CONSENT_VERSION, acceptedAt: clock.now() }],
            sessions: [
                {
                    application: 'resident_app',
                    transport: 'header',
                    endedAt: null,
                    tokenHash: createHash('sha256')
                        .update(session.token)
                        .digest('hex'),
                },
            ],
        });
        expect(session).toEqual({
            token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
            accountId: account?.id,
            application: 'resident_app',
        });
        expect(await testApp.db.phoneCode.count()).toBe(0);
        expect(await testApp.db.pendingSignIn.count()).toBe(0);
    });

    it('signs a registered number in and creates no second account', async () => {
        const first = await registerResident(testApp, doubles);
        clock.advance(MINUTE_MS);

        const second = await confirmSentCode(testApp, doubles, '0037369000001');

        expect(second).toEqual({
            outcome: 'signed_in',
            session: {
                token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
                accountId: first.accountId,
                application: 'resident_app',
            },
            pending: null,
        });
        expect(second.session?.token).not.toBe(first.token);
        expect(await testApp.db.account.count()).toBe(1);
        expect(await testApp.db.consent.count()).toBe(1);
        expect(await testApp.db.session.count()).toBe(2);
        expect(await testApp.db.phoneCode.count()).toBe(0);
    });

    it('answers a request for a code the same way for a registered and an unknown number', async () => {
        await registerResident(testApp, doubles);
        clock.advance(MINUTE_MS);
        doubles.sender.clear();

        const registered = await requestCode(testApp, RESIDENT.phone).expect(
            200,
        );
        const unknown = await requestCode(testApp, UNKNOWN_PHONE).expect(200);

        expect(responseBody<CodeBody>(unknown)).toEqual(
            responseBody<CodeBody>(registered),
        );
        expect(doubles.sender.sent().map(({ phone }) => phone)).toEqual([
            RESIDENT.phone,
            UNKNOWN_PHONE,
        ]);
        expect(await testApp.db.phoneCode.count()).toBe(2);
    });

    it('answers a wrong code the same way whether the number is registered, unknown or never asked for a code', async () => {
        await registerResident(testApp, doubles);
        clock.advance(MINUTE_MS);
        await requestCode(testApp, RESIDENT.phone).expect(200);
        await requestCode(testApp, UNKNOWN_PHONE).expect(200);

        const registered = errorOf(
            await confirmCode(testApp, RESIDENT.phone, WRONG_CODE).expect(401),
        );
        const unknown = errorOf(
            await confirmCode(testApp, UNKNOWN_PHONE, WRONG_CODE).expect(401),
        );
        const neverAsked = errorOf(
            await confirmCode(testApp, '+37379000008', WRONG_CODE).expect(401),
        );

        const { code, message, details } = registered;
        expect({ code, message, details }).toEqual({
            code: 'IDENTITY_CODE_INVALID',
            message: 'Code is incorrect',
            details: undefined,
        });
        for (const other of [unknown, neverAsked]) {
            expect({
                code: other.code,
                message: other.message,
                details: other.details,
            }).toEqual({ code, message, details });
        }
        expect(await testApp.db.session.count()).toBe(1);
    });

    it('closes the entry of the phone for fifteen minutes after five wrong codes in a row', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const sent = doubles.sender.lastCodeFor(RESIDENT.phone);

        for (let attempt = 0; attempt < 4; attempt += 1) {
            expect(
                errorOf(
                    await confirmCode(
                        testApp,
                        RESIDENT.phone,
                        WRONG_CODE,
                    ).expect(401),
                ).code,
            ).toBe('IDENTITY_CODE_INVALID');
        }
        const fifth = await confirmCode(
            testApp,
            RESIDENT.phone,
            WRONG_CODE,
        ).expect(429);
        clock.advance(MINUTE_MS);
        const rightWhileLocked = await confirmCode(
            testApp,
            RESIDENT.phone,
            sent,
        ).expect(429);

        expect(errorOf(fifth)).toMatchObject({
            code: 'THROTTLE_ATTEMPTS_LOCKED',
            details: { retryAfterSeconds: 900 },
        });
        expect(fifth.get('Retry-After')).toBe('900');
        expect(errorOf(rightWhileLocked)).toMatchObject({
            code: 'THROTTLE_ATTEMPTS_LOCKED',
            details: { retryAfterSeconds: 840 },
        });

        clock.advance(14 * MINUTE_MS);
        const opened = await confirmSentCode(testApp, doubles, RESIDENT.phone);

        expect(opened.outcome).toBe('registration_required');
    });

    it('forgets wrong codes after a right one', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        for (let attempt = 0; attempt < 4; attempt += 1) {
            await confirmCode(testApp, RESIDENT.phone, WRONG_CODE).expect(401);
        }
        await confirmCode(
            testApp,
            RESIDENT.phone,
            doubles.sender.lastCodeFor(RESIDENT.phone),
        ).expect(200);
        clock.advance(MINUTE_MS);
        await requestCode(testApp, RESIDENT.phone).expect(200);

        for (let attempt = 0; attempt < 4; attempt += 1) {
            await confirmCode(testApp, RESIDENT.phone, WRONG_CODE).expect(401);
        }
        expect(await testApp.db.attemptSeries.count()).toBe(1);
    });

    it('does not give five more attempts for a new code', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await confirmCode(testApp, RESIDENT.phone, WRONG_CODE).expect(401);
        }
        clock.advance(MINUTE_MS);
        await requestCode(testApp, RESIDENT.phone).expect(200);

        await confirmCode(testApp, RESIDENT.phone, WRONG_CODE).expect(401);
        await confirmCode(testApp, RESIDENT.phone, WRONG_CODE).expect(429);
    });

    it('refuses a code that is older than ten minutes', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const sent = doubles.sender.lastCodeFor(RESIDENT.phone);

        clock.advance(10 * MINUTE_MS);
        const response = await confirmCode(
            testApp,
            RESIDENT.phone,
            sent,
        ).expect(401);

        expect(errorOf(response)).toMatchObject({
            code: 'IDENTITY_CODE_EXPIRED',
            message: 'Code has expired, request a new one',
        });
        expect(await testApp.db.session.count()).toBe(0);
    });

    it('refuses to send the code again earlier than in sixty seconds', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        clock.advance(59 * SECOND_MS);

        const early = await requestCode(testApp, RESIDENT.writtenPhone).expect(
            429,
        );

        expect(errorOf(early)).toMatchObject({
            code: 'THROTTLE_RATE_LIMITED',
            details: { retryAfterSeconds: 1 },
        });
        expect(early.get('Retry-After')).toBe('1');
        expect(doubles.sender.sent()).toHaveLength(1);

        await requestCode(testApp, UNKNOWN_PHONE).expect(200);
        clock.advance(SECOND_MS);
        await requestCode(testApp, RESIDENT.phone).expect(200);
        expect(doubles.sender.sent()).toHaveLength(3);
    });

    it('keeps one live code per phone: a new code replaces the previous one', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const first = doubles.sender.lastCodeFor(RESIDENT.phone);
        clock.advance(MINUTE_MS);
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const second = doubles.sender.lastCodeFor(RESIDENT.phone);

        await confirmCode(testApp, RESIDENT.phone, first).expect(401);
        await confirmCode(testApp, RESIDENT.phone, second).expect(200);
        expect(second).not.toBe(first);
        expect(await testApp.db.phoneCode.count()).toBe(0);
        expect(await testApp.db.pendingSignIn.count()).toBe(1);
    });

    it('accepts a code once', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const sent = doubles.sender.lastCodeFor(RESIDENT.phone);

        await confirmCode(testApp, RESIDENT.phone, sent).expect(200);
        const again = await confirmCode(testApp, RESIDENT.phone, sent).expect(
            401,
        );

        expect(errorOf(again).code).toBe('IDENTITY_CODE_INVALID');
    });

    it('stores the fingerprint of the code, not the code', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const sent = doubles.sender.lastCodeFor(RESIDENT.phone);

        const [stored] = await testApp.db.phoneCode.findMany();

        expect(stored?.codeHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(stored)).not.toContain(sent);
    });

    it('rejects a number that is not Moldovan before sending anything', async () => {
        for (const phone of ['+40721234567', '022123456', '06912345']) {
            const requested = await requestCode(testApp, phone).expect(400);
            const confirmed = await confirmCode(
                testApp,
                phone,
                '111111',
            ).expect(400);

            for (const response of [requested, confirmed]) {
                expect(errorOf(response).code).toBe('IDENTITY_PHONE_INVALID');
                expect(errorOf(response).details).toBeUndefined();
                expect(response.text).not.toContain(phone);
            }
        }
        expect(doubles.sender.sent()).toEqual([]);
        expect(await testApp.db.phoneCode.count()).toBe(0);
        expect(await testApp.db.attemptSeries.count()).toBe(0);
    });

    it('rejects a malformed request without counting an attempt', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);

        const noPhone = await testApp
            .http()
            .post(CODES_PATH)
            .send({})
            .expect(400);
        const shortCode = await confirmCode(
            testApp,
            RESIDENT.phone,
            '12345',
        ).expect(400);
        const noName = await finish(REGISTRATION_PATH, {
            pendingToken: 'any',
            consentVersion: CONSENT_VERSION,
            firstName: '   ',
        }).expect(400);

        const unknownLanguage = await requestCode(
            testApp,
            UNKNOWN_PHONE,
            'en',
        ).expect(400);

        expect(errorOf(noPhone)).toMatchObject({
            code: 'VALIDATION_FAILED',
            details: { fields: [{ path: 'phone' }, { path: 'language' }] },
        });
        expect(errorOf(unknownLanguage)).toMatchObject({
            code: 'VALIDATION_FAILED',
            details: { fields: [{ path: 'language', rules: ['isIn'] }] },
        });
        expect(doubles.sender.sent()).toHaveLength(1);
        expect(errorOf(shortCode)).toMatchObject({
            code: 'VALIDATION_FAILED',
            details: { fields: [{ path: 'code', rules: ['matches'] }] },
        });
        expect(errorOf(noName)).toMatchObject({
            code: 'VALIDATION_FAILED',
            details: {
                fields: [{ path: 'firstName' }, { path: 'lastName' }],
            },
        });
        expect(await testApp.db.attemptSeries.count()).toBe(0);
    });

    it('finishes a registration only with a live pending token and the current version of the consent', async () => {
        const { pending } = await confirmSentCode(
            testApp,
            doubles,
            RESIDENT.phone,
        );
        const token = pending?.token ?? '';

        const outdated = await registration(token, 'e2e-version-0').expect(409);
        const unknown = await registration('never-issued-token').expect(401);

        expect(errorOf(outdated).code).toBe(
            'IDENTITY_CONSENT_VERSION_OUTDATED',
        );
        expect(errorOf(outdated).details).toBeUndefined();
        expect(errorOf(unknown).code).toBe('IDENTITY_PENDING_TOKEN_INVALID');
        expect(errorOf(unknown).details).toBeUndefined();
        expect(await testApp.db.account.count()).toBe(0);

        await registration(token).expect(201);
        const again = await registration(token).expect(401);

        expect(errorOf(again).code).toBe('IDENTITY_PENDING_TOKEN_INVALID');
        expect(await testApp.db.account.count()).toBe(1);
    });

    it('lets the pending token wait thirty minutes for the consent, not longer', async () => {
        const first = await confirmSentCode(testApp, doubles, RESIDENT.phone);
        clock.advance(30 * MINUTE_MS);

        const late = await registration(first.pending?.token ?? '').expect(401);

        expect(errorOf(late).code).toBe('IDENTITY_PENDING_TOKEN_INVALID');
        expect(await testApp.db.account.count()).toBe(0);

        const second = await confirmSentCode(testApp, doubles, RESIDENT.phone);
        clock.advance(30 * MINUTE_MS - 1);
        await registration(second.pending?.token ?? '').expect(201);
    });

    it('keeps the pending token when somebody asks for a new code for the phone', async () => {
        const first = await confirmSentCode(testApp, doubles, RESIDENT.phone);
        clock.advance(MINUTE_MS);
        await requestCode(testApp, RESIDENT.phone).expect(200);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await confirmCode(testApp, RESIDENT.phone, WRONG_CODE);
        }

        await registration(first.pending?.token ?? '').expect(201);

        expect(await testApp.db.account.count()).toBe(1);
        expect(await testApp.db.pendingSignIn.count()).toBe(0);
    });

    it('replaces the pending token only when a new code of the phone is confirmed', async () => {
        const first = await confirmSentCode(testApp, doubles, RESIDENT.phone);
        clock.advance(MINUTE_MS);
        const second = await confirmSentCode(testApp, doubles, RESIDENT.phone);

        const stale = await registration(first.pending?.token ?? '').expect(
            401,
        );

        expect(errorOf(stale).code).toBe('IDENTITY_PENDING_TOKEN_INVALID');
        expect(await testApp.db.pendingSignIn.count()).toBe(1);
        await registration(second.pending?.token ?? '').expect(201);
        expect(await testApp.db.account.count()).toBe(1);
    });

    it('stores nothing when the code could not be sent and keeps the previous code working', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const delivered = doubles.sender.lastCodeFor(RESIDENT.phone);
        const [before] = await testApp.db.phoneCode.findMany();
        clock.advance(MINUTE_MS);
        doubles.sender.failNext();

        const failed = await requestCode(testApp, RESIDENT.phone).expect(500);

        expect(errorOf(failed).code).toBe('INTERNAL_ERROR');
        expect(await testApp.db.phoneCode.findMany()).toEqual([before]);
        expect(doubles.sender.sent()).toHaveLength(1);
        const confirmed = loginBodyOf(
            await confirmCode(testApp, RESIDENT.phone, delivered).expect(200),
        );
        expect(confirmed.outcome).toBe('registration_required');
    });

    it('takes the language of a new profile from the request for the code', async () => {
        await requestCode(testApp, RESIDENT.phone, 'ru').expect(200);
        const confirmed = loginBodyOf(
            await confirmCode(
                testApp,
                RESIDENT.phone,
                doubles.sender.lastCodeFor(RESIDENT.phone),
            ).expect(200),
        );

        await registration(confirmed.pending?.token ?? '').expect(201);

        expect(doubles.sender.sent()).toMatchObject([{ language: 'ru' }]);
        expect(await testApp.db.account.findFirstOrThrow()).toMatchObject({
            phone: RESIDENT.phone,
            language: 'ru',
        });
    });

    it('does not change the language of an account that already exists', async () => {
        await registerResident(testApp, doubles);
        const accountId = await createAdmin(testApp);
        clock.advance(MINUTE_MS);

        await requestCode(testApp, RESIDENT.phone, 'ru').expect(200);
        await confirmCode(
            testApp,
            RESIDENT.phone,
            doubles.sender.lastCodeFor(RESIDENT.phone),
        ).expect(200);
        await requestCode(testApp, ADMIN.phone, 'ru').expect(200);
        const pending = loginBodyOf(
            await confirmCode(
                testApp,
                ADMIN.phone,
                doubles.sender.lastCodeFor(ADMIN.phone),
            ).expect(200),
        ).pending;
        await finish(CONSENT_PATH, {
            pendingToken: pending?.token ?? '',
            consentVersion: CONSENT_VERSION,
        }).expect(200);

        expect(
            await testApp.db.account.findUniqueOrThrow({
                where: { phone: RESIDENT.phone },
            }),
        ).toMatchObject({ language: 'ro' });
        expect(
            await testApp.db.account.findUniqueOrThrow({
                where: { id: accountId },
            }),
        ).toMatchObject({ language: null });
    });

    it('stores the name without the spaces around it', async () => {
        const { pending } = await confirmSentCode(
            testApp,
            doubles,
            RESIDENT.phone,
        );

        await finish(REGISTRATION_PATH, {
            pendingToken: pending?.token ?? '',
            consentVersion: CONSENT_VERSION,
            firstName: '  Ana Maria ',
            lastName: ' Popescu-Rusu  ',
        }).expect(201);

        expect(await testApp.db.account.findFirstOrThrow()).toMatchObject({
            firstName: 'Ana Maria',
            lastName: 'Popescu-Rusu',
        });
    });

    it('asks an account that is not a resident yet only for the consent and keeps its name and its panel session', async () => {
        const accountId = await createAdmin(testApp);
        const panelToken = await signedInToken(testApp);
        clock.advance(MINUTE_MS);
        const confirmedAt = clock.now();

        const confirmed = await confirmSentCode(testApp, doubles, ADMIN.phone);

        expect(confirmed).toMatchObject({
            outcome: 'consent_required',
            session: null,
            pending: {
                expiresInSeconds: 1800,
                consentVersion: CONSENT_VERSION,
            },
        });
        expect(
            await testApp.db.account.findUniqueOrThrow({
                where: { id: accountId },
            }),
        ).toMatchObject({ phoneVerifiedAt: confirmedAt });
        expect(await testApp.db.consent.count()).toBe(0);

        const outdated = await finish(CONSENT_PATH, {
            pendingToken: confirmed.pending?.token ?? '',
            consentVersion: 'e2e-version-0',
        }).expect(409);
        const accepted = await finish(CONSENT_PATH, {
            pendingToken: confirmed.pending?.token ?? '',
            consentVersion: CONSENT_VERSION,
        }).expect(200);

        expect(errorOf(outdated).code).toBe(
            'IDENTITY_CONSENT_VERSION_OUTDATED',
        );
        expect(sessionBodyOf(accepted)).toMatchObject({
            accountId,
            application: 'resident_app',
        });
        expect(await testApp.db.account.count()).toBe(1);
        expect(
            await testApp.db.account.findUniqueOrThrow({
                where: { id: accountId },
                include: { consents: true },
            }),
        ).toMatchObject({
            firstName: ADMIN.firstName,
            lastName: ADMIN.lastName,
            email: ADMIN.email,
            consents: [{ version: CONSENT_VERSION }],
        });
        await testApp
            .http()
            .get(SESSION_PATH)
            .set('Cookie', cookieHeader(panelToken))
            .expect(200);

        clock.advance(MINUTE_MS);
        const next = await confirmSentCode(testApp, doubles, ADMIN.phone);
        expect(next.outcome).toBe('signed_in');
    });

    it('does not rename an existing account through the registration and does not register through the consent', async () => {
        const account = accountRow.build({ phone: RESIDENT.phone });
        await testApp.db.account.create({ data: account });
        const existing = await confirmSentCode(
            testApp,
            doubles,
            RESIDENT.phone,
        );
        const unknown = await confirmSentCode(testApp, doubles, UNKNOWN_PHONE);

        await registration(existing.pending?.token ?? '').expect(201);
        const refused = await finish(CONSENT_PATH, {
            pendingToken: unknown.pending?.token ?? '',
            consentVersion: CONSENT_VERSION,
        }).expect(401);

        expect(errorOf(refused).code).toBe('IDENTITY_PENDING_TOKEN_INVALID');
        expect(await testApp.db.account.findMany()).toMatchObject([
            { id: account.id, lastName: account.lastName },
        ]);
        await registration(unknown.pending?.token ?? '').expect(201);
        expect(await testApp.db.account.count()).toBe(2);
    });

    it('checks no more than four of many wrong codes sent at once', async () => {
        await requestCode(testApp, RESIDENT.phone).expect(200);
        const sent = doubles.sender.lastCodeFor(RESIDENT.phone);

        const answers = await Promise.all(
            Array.from({ length: 10 }, () =>
                confirmCode(testApp, RESIDENT.phone, WRONG_CODE),
            ),
        );

        const statuses = answers.map(({ status }) => status);
        expect(statuses.filter((status) => status === 401)).toHaveLength(4);
        expect(statuses.filter((status) => status === 429)).toHaveLength(6);
        await confirmCode(testApp, RESIDENT.phone, sent).expect(429);
    });

    it('creates one account when the registration is finished twice at once', async () => {
        const { pending } = await confirmSentCode(
            testApp,
            doubles,
            RESIDENT.phone,
        );

        const answers = await Promise.all(
            Array.from({ length: 4 }, () => registration(pending?.token ?? '')),
        );

        const statuses = answers.map(({ status }) => status);
        expect(statuses.filter((status) => status === 201)).toHaveLength(1);
        expect(statuses.filter((status) => status === 401)).toHaveLength(3);
        expect(await testApp.db.account.count()).toBe(1);
        expect(await testApp.db.consent.count()).toBe(1);
        expect(await testApp.db.session.count()).toBe(1);
    });

    it('makes a registration wait for the one that holds the pending token and then finds the token used', async () => {
        const { pending } = await confirmSentCode(
            testApp,
            doubles,
            RESIDENT.phone,
        );
        const pendingToken = pending?.token ?? '';
        const pendings = testApp.app.get(PendingSignInRepository);

        const { second } = await runOverlapped({
            db: testApp.db,
            transactions: testApp.app.get(Transactions),
            first: async (tx) => {
                const held = await pendings.lockByTokenHash(
                    tx,
                    createHash('sha256').update(pendingToken).digest('hex'),
                );
                if (held === null) {
                    throw new Error('The pending token was not stored');
                }
                await pendings.remove(tx, held);
            },
            second: () =>
                testApp.app.get(ResidentSignInService).register({
                    pendingToken,
                    consentVersion: CONSENT_VERSION,
                    firstName: RESIDENT.firstName,
                    lastName: RESIDENT.lastName,
                }),
        });

        expect(second).toMatchObject({
            status: 'rejected',
            reason: { code: 'IDENTITY_PENDING_TOKEN_INVALID' },
        });
        expect(await testApp.db.account.count()).toBe(0);
    });

    it('gives an account without a unit access to no house', async () => {
        const session = await registerResident(testApp, doubles);

        const response = await testApp
            .http()
            .get(ACCESS_PATH)
            .set('Authorization', bearer(session.token))
            .expect(200);

        expect(
            responseBody<{ accountId: string; grants: unknown[] }>(response),
        ).toEqual({
            accountId: session.accountId,
            application: 'resident_app',
            grants: [],
        });
    });
});
