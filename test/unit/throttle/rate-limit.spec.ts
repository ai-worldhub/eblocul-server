import {
    defineRateLimit,
    type RateLimit,
    retryAfterSecondsOf,
    takeToken,
} from '../../../src/core/throttle/domain/rules/rate-limit.ts';
import { nextPurgeAt } from '../../../src/core/throttle/domain/rules/purge-schedule.ts';
import { ThrottleError } from '../../../src/core/throttle/domain/throttle.errors.ts';

const NOW = new Date('2026-10-08T10:00:00.000Z');
const SECOND_MS = 1000;

const after = (moment: Date, seconds: number): Date =>
    new Date(moment.getTime() + seconds * SECOND_MS);

const spend = (
    limit: RateLimit,
    fullAt: Date | null,
    now: Date,
    times: number,
): { fullAt: Date | null; taken: number } => {
    let current = fullAt;
    let taken = 0;
    for (let request = 0; request < times; request += 1) {
        const decision = takeToken(limit, current, now);
        if (decision.isTaken) {
            current = decision.fullAt;
            taken += 1;
        }
    }
    return { fullAt: current, taken };
};

describe('rate limit', () => {
    const limit = defineRateLimit({
        group: 'auth',
        burst: 5,
        refillSeconds: 2,
    });

    it('lets the whole burst through at once and refuses the next request', () => {
        const burst = spend(limit, null, NOW, 5);

        expect(burst.taken).toBe(5);
        expect(takeToken(limit, burst.fullAt, NOW)).toEqual({
            isTaken: false,
            retryAfterSeconds: 2,
        });
    });

    it('gives back one request per refill time, not the whole burst at a boundary', () => {
        const burst = spend(limit, null, NOW, 5);

        expect(spend(limit, burst.fullAt, after(NOW, 1), 1).taken).toBe(0);
        expect(spend(limit, burst.fullAt, after(NOW, 2), 3).taken).toBe(1);
        expect(spend(limit, burst.fullAt, after(NOW, 6), 5).taken).toBe(3);
    });

    it('gives the whole burst back after a full rest', () => {
        const burst = spend(limit, null, NOW, 5);

        expect(spend(limit, burst.fullAt, after(NOW, 10), 6).taken).toBe(5);
        expect(spend(limit, burst.fullAt, after(NOW, 3600), 6).taken).toBe(5);
    });

    it('never lets through more than the burst plus the refill over any stretch', () => {
        let fullAt: Date | null = null;
        let taken = 0;
        for (let second = 0; second < 60; second += 1) {
            const spent = spend(limit, fullAt, after(NOW, second), 10);
            fullAt = spent.fullAt;
            taken += spent.taken;
        }

        expect(taken).toBe(5 + 29);
    });

    it('tells how long to wait until the next request passes', () => {
        const burst = spend(limit, null, NOW, 5);

        expect(retryAfterSecondsOf(limit, burst.fullAt, NOW)).toBe(2);
        expect(
            retryAfterSecondsOf(
                limit,
                burst.fullAt,
                new Date(NOW.getTime() + 1500),
            ),
        ).toBe(1);
        expect(retryAfterSecondsOf(limit, null, NOW)).toBe(2);
    });

    it('paces a single request when the burst is one', () => {
        const pause = defineRateLimit({
            group: 'code_resend',
            burst: 1,
            refillSeconds: 60,
        });
        const first = spend(pause, null, NOW, 2);

        expect(first.taken).toBe(1);
        expect(retryAfterSecondsOf(pause, first.fullAt, after(NOW, 15))).toBe(
            45,
        );
        expect(spend(pause, first.fullAt, after(NOW, 59), 1).taken).toBe(0);
        expect(spend(pause, first.fullAt, after(NOW, 60), 1).taken).toBe(1);
    });

    it('refuses a limit that cannot be counted', () => {
        for (const input of [
            { group: 'Auth', burst: 5, refillSeconds: 2 },
            { group: 'auth', burst: 0, refillSeconds: 2 },
            { group: 'auth', burst: 1.5, refillSeconds: 2 },
            { group: 'auth', burst: 5, refillSeconds: 0 },
            { group: 'auth', burst: 5, refillSeconds: Number.NaN },
        ]) {
            expect(() => defineRateLimit(input)).toThrow(ThrottleError);
        }
    });
});

describe('purge schedule', () => {
    it('puts the next purge on the five-minute grid, at least half a minute ahead', () => {
        expect(nextPurgeAt(new Date('2026-10-08T10:01:30.000Z'))).toEqual(
            new Date('2026-10-08T10:05:00.000Z'),
        );
        expect(nextPurgeAt(new Date('2026-10-08T10:04:29.999Z'))).toEqual(
            new Date('2026-10-08T10:05:00.000Z'),
        );
        expect(nextPurgeAt(new Date('2026-10-08T10:04:30.000Z'))).toEqual(
            new Date('2026-10-08T10:10:00.000Z'),
        );
        expect(nextPurgeAt(new Date('2026-10-08T10:05:00.000Z'))).toEqual(
            new Date('2026-10-08T10:10:00.000Z'),
        );
    });
});
