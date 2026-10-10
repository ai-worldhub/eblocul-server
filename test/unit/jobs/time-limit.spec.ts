import {
    CANCEL_GRACE_MS,
    isCancelIgnored,
    isTimeLimitExceeded,
} from '../../../src/core/jobs/domain/time-limit.ts';

const STARTED_AT = new Date('2026-10-09T10:00:00.000Z');
const LIMIT_MS = 30_000;

const after = (durationMs: number): Date =>
    new Date(STARTED_AT.getTime() + durationMs);

describe('isTimeLimitExceeded', () => {
    it('holds until the limit has passed since the start', () => {
        expect(isTimeLimitExceeded(STARTED_AT, LIMIT_MS, STARTED_AT)).toBe(
            false,
        );
        expect(
            isTimeLimitExceeded(STARTED_AT, LIMIT_MS, after(LIMIT_MS - 1)),
        ).toBe(false);
        expect(isTimeLimitExceeded(STARTED_AT, LIMIT_MS, after(LIMIT_MS))).toBe(
            true,
        );
    });
});

describe('isCancelIgnored', () => {
    it('gives the handler as long to stop as a stopping process does', () => {
        expect(CANCEL_GRACE_MS).toBe(8000);
    });

    it('holds until the wait has passed since the cancel', () => {
        const cancelledAt = after(LIMIT_MS);

        expect(isCancelIgnored(cancelledAt, cancelledAt)).toBe(false);
        expect(
            isCancelIgnored(cancelledAt, after(LIMIT_MS + CANCEL_GRACE_MS - 1)),
        ).toBe(false);
        expect(
            isCancelIgnored(cancelledAt, after(LIMIT_MS + CANCEL_GRACE_MS)),
        ).toBe(true);
    });
});
