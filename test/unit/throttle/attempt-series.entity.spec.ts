import { AttemptSeriesEntity } from '../../../src/core/throttle/domain/entities/attempt-series.entity.ts';
import { defineAttemptRule } from '../../../src/core/throttle/domain/rules/attempt-rule.ts';
import { ThrottleError } from '../../../src/core/throttle/domain/throttle.errors.ts';

const NOW = new Date('2026-10-08T10:00:00.000Z');
const MINUTE_MS = 60_000;
const LOCK_SECONDS = 900;

const RULE = defineAttemptRule({
    name: 'identity.admin_password',
    maxFailures: 5,
    lockSeconds: LOCK_SECONDS,
    forgetAfterSeconds: LOCK_SECONDS,
});

const after = (minutes: number): Date =>
    new Date(NOW.getTime() + minutes * MINUTE_MS);

const open = (): AttemptSeriesEntity =>
    AttemptSeriesEntity.open({
        id: '00000000-0000-7000-8000-000000000001',
        key: 'fingerprint',
        now: NOW,
    });

const failTimes = (
    series: AttemptSeriesEntity,
    times: number,
    now: Date,
): void => {
    for (let attempt = 0; attempt < times; attempt += 1) {
        series.register(RULE, now);
    }
};

describe('AttemptSeriesEntity', () => {
    it('counts four attempts without closing the entry', () => {
        const series = open();

        for (let attempt = 0; attempt < 4; attempt += 1) {
            expect(series.register(RULE, NOW)).toEqual({
                isCounted: true,
                retryAfterSeconds: null,
            });
        }
        expect(series.view()).toMatchObject({
            failures: 4,
            lockEndsAt: null,
            expiresAt: after(15),
        });
    });

    it('closes the entry for fifteen minutes on the fifth attempt', () => {
        const series = open();
        failTimes(series, 4, NOW);

        expect(series.register(RULE, NOW)).toEqual({
            isCounted: true,
            retryAfterSeconds: LOCK_SECONDS,
        });
        expect(series.view()).toMatchObject({
            failures: 5,
            lockEndsAt: after(15),
            expiresAt: after(15),
        });
    });

    it('does not count an attempt while the entry is closed and does not prolong the lock', () => {
        const series = open();
        failTimes(series, 5, NOW);

        expect(series.register(RULE, after(14))).toEqual({
            isCounted: false,
            retryAfterSeconds: 60,
        });
        expect(
            series.register(RULE, new Date(after(15).getTime() - 1)),
        ).toEqual({ isCounted: false, retryAfterSeconds: 1 });
        expect(series.view().lockEndsAt).toEqual(after(15));
    });

    it('opens the entry after fifteen minutes and starts the count anew', () => {
        const series = open();
        failTimes(series, 5, NOW);

        expect(series.register(RULE, after(15))).toEqual({
            isCounted: true,
            retryAfterSeconds: null,
        });
        expect(series.view()).toMatchObject({ failures: 1, lockEndsAt: null });
    });

    it('forgets the attempts after fifteen quiet minutes', () => {
        const series = open();
        failTimes(series, 4, NOW);

        expect(series.register(RULE, after(15))).toEqual({
            isCounted: true,
            retryAfterSeconds: null,
        });
        expect(series.view().failures).toBe(1);
    });

    it('keeps counting while the attempts come closer than fifteen minutes apart', () => {
        const series = open();
        failTimes(series, 2, NOW);
        failTimes(series, 2, after(14));

        expect(series.register(RULE, after(28))).toEqual({
            isCounted: true,
            retryAfterSeconds: LOCK_SECONDS,
        });
    });

    it('refuses a rule that cannot be counted', () => {
        for (const input of [
            { ...RULE, name: 'admin_password' },
            { ...RULE, maxFailures: 0 },
            { ...RULE, lockSeconds: 0.5 },
            { ...RULE, forgetAfterSeconds: -1 },
        ]) {
            expect(() => defineAttemptRule(input)).toThrow(ThrottleError);
        }
    });
});
