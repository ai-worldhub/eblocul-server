import type { Response } from 'supertest';
import { PasswordHasher } from '../../../src/core/identity/ports/password-hasher.port.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { EventLogger } from '../../../src/shared/logging/event-logger.ts';
import {
    ADMIN,
    createAdmin,
    type Credentials,
    issuedCookie,
    signIn,
} from '../../utils/admin-session.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';
import { responseBody } from '../../utils/response-body.ts';
import { createTestApp } from '../../utils/test-app.factory.ts';

type ErrorBody = {
    code: string;
    message: string;
    details?: Record<string, unknown>;
};

type Refusal = {
    status: number;
    code: string;
    message: string;
    details: Record<string, unknown> | undefined;
    retryAfter: unknown;
};

const NOW = new Date('2026-10-08T10:00:00.000Z');
const MINUTE_MS = 60_000;
const LOCK_MINUTES = 15;
const LOCK_SECONDS = 900;
const MAX_FAILURES = 5;
const PARALLEL_ATTEMPTS = 8;
const UNKNOWN_EMAIL = 'nobody@example.com';
const WRONG: Credentials = {
    email: ADMIN.email,
    password: 'wrong-password-99',
};
const UNKNOWN: Credentials = {
    email: UNKNOWN_EMAIL,
    password: 'wrong-password-99',
};
const FINGERPRINT = /^[A-Za-z0-9_-]{43}$/;

const WRONG_ANSWER: Refusal = {
    status: 401,
    code: 'IDENTITY_CREDENTIALS_INVALID',
    message: 'Email or password is incorrect',
    details: undefined,
    retryAfter: undefined,
};

const lockedAnswer = (seconds: number): Refusal => ({
    status: 429,
    code: 'THROTTLE_ATTEMPTS_LOCKED',
    message: 'Too many wrong attempts, try again later',
    details: { retryAfterSeconds: seconds },
    retryAfter: String(seconds),
});

const refusalOf = (response: Response): Refusal => {
    const { code, message, details } = responseBody<ErrorBody>(response);
    expect(issuedCookie(response)).toBeNull();
    return {
        status: response.status,
        code,
        message,
        details,
        retryAfter: response.headers['retry-after'],
    };
};

describe('Lock after wrong sign-in attempts (e2e)', () => {
    const clock = new ClockDouble(NOW);
    const testApp = useTestApp((builder) =>
        builder.overrideProvider(Clock).useValue(clock),
    );

    const refuse = async (credentials: Credentials): Promise<Refusal> =>
        refusalOf(await signIn(testApp, credentials));

    const failTimes = async (
        times: number,
        credentials: Credentials = WRONG,
    ): Promise<Refusal[]> => {
        const refusals: Refusal[] = [];
        for (let attempt = 0; attempt < times; attempt += 1) {
            refusals.push(await refuse(credentials));
        }
        return refusals;
    };

    it('closes the entry on the fifth wrong password and tells how long to wait', async () => {
        await createAdmin(testApp);

        expect(await failTimes(MAX_FAILURES - 1)).toEqual(
            Array<Refusal>(MAX_FAILURES - 1).fill(WRONG_ANSWER),
        );
        expect(await refuse(WRONG)).toEqual(lockedAnswer(LOCK_SECONDS));
        clock.advance(MINUTE_MS);
        expect(await refuse(WRONG)).toEqual(
            lockedAnswer(LOCK_SECONDS - MINUTE_MS / 1000),
        );
    });

    it('does not let the right password through while the entry is closed', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES);

        expect(await refuse(ADMIN)).toEqual(lockedAnswer(LOCK_SECONDS));
        expect(await testApp.db.session.count()).toBe(0);
    });

    it('opens the entry after fifteen minutes', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES);

        clock.advance(LOCK_MINUTES * MINUTE_MS - 1);
        expect(await refuse(ADMIN)).toEqual(lockedAnswer(1));
        clock.advance(1);
        await signIn(testApp).expect(200);

        expect(await testApp.db.attemptSeries.count()).toBe(0);
    });

    it('does not prolong the lock by attempts made during it', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES);

        clock.advance((LOCK_MINUTES - 1) * MINUTE_MS);
        expect(await failTimes(3)).toEqual(
            Array<Refusal>(3).fill(lockedAnswer(MINUTE_MS / 1000)),
        );
        clock.advance(MINUTE_MS);

        await signIn(testApp).expect(200);
    });

    it('answers an unknown email exactly as a known one at every step', async () => {
        await createAdmin(testApp);

        const known = await failTimes(MAX_FAILURES + 1);
        const unknown = await failTimes(MAX_FAILURES + 1, UNKNOWN);
        clock.advance(MINUTE_MS);
        known.push(await refuse(WRONG));
        unknown.push(await refuse(UNKNOWN));

        expect(unknown).toEqual(known);
        expect(known.map(({ status }) => status)).toEqual([
            401, 401, 401, 401, 429, 429, 429,
        ]);
    });

    it('checks a password even while the entry is closed, so the answer takes as long', async () => {
        const accountId = await createAdmin(testApp);
        const stored = await testApp.db.accountPassword.findUniqueOrThrow({
            where: { accountId },
        });
        await failTimes(MAX_FAILURES);
        const verify = vi.spyOn(testApp.app.get(PasswordHasher), 'verify');

        await refuse(ADMIN);
        await refuse(UNKNOWN);

        expect(verify).toHaveBeenCalledTimes(2);
        for (const [, hash] of verify.mock.calls) {
            expect(hash).toMatch(/^\$argon2id\$/);
            expect(hash).not.toBe(stored.hash);
        }
    });

    it('starts the count anew after a successful sign-in', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES - 1);
        const warn = vi.spyOn(testApp.app.get(EventLogger), 'warn');

        await signIn(testApp).expect(200);

        expect(warn).not.toHaveBeenCalled();

        expect(await testApp.db.attemptSeries.count()).toBe(0);
        expect(await failTimes(MAX_FAILURES - 1)).toEqual(
            Array<Refusal>(MAX_FAILURES - 1).fill(WRONG_ANSWER),
        );
        expect(await refuse(WRONG)).toEqual(lockedAnswer(LOCK_SECONDS));
        expect(warn.mock.calls).toEqual([
            [
                'throttle.attempts_locked',
                { rule: 'identity.admin_password', lockSeconds: LOCK_SECONDS },
            ],
        ]);
    });

    it('forgets wrong passwords after fifteen quiet minutes', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES - 1);

        clock.advance(LOCK_MINUTES * MINUTE_MS);

        expect(await failTimes(MAX_FAILURES - 1)).toEqual(
            Array<Refusal>(MAX_FAILURES - 1).fill(WRONG_ANSWER),
        );
    });

    it('counts the email whatever its letter case', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES - 1);

        expect(await refuse({ ...WRONG, email: 'Admin@Example.COM' })).toEqual(
            lockedAnswer(LOCK_SECONDS),
        );
        expect(await testApp.db.attemptSeries.count()).toBe(1);
    });

    it('lets parallel wrong attempts check the password five times and no more', async () => {
        const accountId = await createAdmin(testApp);
        const stored = await testApp.db.accountPassword.findUniqueOrThrow({
            where: { accountId },
        });
        const verify = vi.spyOn(testApp.app.get(PasswordHasher), 'verify');

        const refusals = await Promise.all(
            Array.from({ length: PARALLEL_ATTEMPTS }, () => refuse(WRONG)),
        );

        const checked = verify.mock.calls.filter(
            ([, hash]) => hash === stored.hash,
        );
        expect(checked).toHaveLength(MAX_FAILURES);
        expect(verify).toHaveBeenCalledTimes(PARALLEL_ATTEMPTS);
        expect(refusals.filter(({ status }) => status === 401)).toHaveLength(
            MAX_FAILURES - 1,
        );
        expect(refusals.filter(({ status }) => status === 429)).toHaveLength(
            PARALLEL_ATTEMPTS - MAX_FAILURES + 1,
        );
        expect(await testApp.db.attemptSeries.findMany()).toMatchObject([
            { failures: MAX_FAILURES },
        ]);
    });

    it('keeps the lock when the application is started again', async () => {
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES);

        const restarted = await createTestApp((builder) =>
            builder.overrideProvider(Clock).useValue(clock),
        );
        try {
            const response = await signIn(restarted);

            expect(refusalOf(response)).toEqual(lockedAnswer(LOCK_SECONDS));
            expect(await restarted.db.session.count()).toBe(0);
        } finally {
            await restarted.app.close();
        }
    });

    it('stores a fingerprint of the email, not the email, and the moment the lock ends', async () => {
        const startedAt = clock.now();
        await createAdmin(testApp);
        await failTimes(MAX_FAILURES);
        await failTimes(1, UNKNOWN);

        const series = await testApp.db.attemptSeries.findMany({
            orderBy: { failures: 'desc' },
        });
        const lockEndsAt = new Date(
            startedAt.getTime() + LOCK_MINUTES * MINUTE_MS,
        );
        expect(series).toMatchObject([
            { failures: MAX_FAILURES, lockEndsAt, expiresAt: lockEndsAt },
            { failures: 1, lockEndsAt: null, expiresAt: lockEndsAt },
        ]);
        for (const row of series) {
            expect(row.key).toMatch(FINGERPRINT);
        }
        expect(JSON.stringify(series)).not.toContain(ADMIN.email);
        expect(JSON.stringify(series)).not.toContain(UNKNOWN_EMAIL);
    });
});
