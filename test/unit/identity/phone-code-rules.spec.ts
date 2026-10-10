import { fixedCodeFor } from '../../../src/core/identity/domain/rules/fixed-code.ts';
import {
    CODE_LIFETIME_SECONDS,
    CODE_PATTERN,
    CODE_RESEND_SECONDS,
    PENDING_LIFETIME_SECONDS,
    RESIDENT_CODE_ATTEMPTS,
    RESIDENT_CODE_RESEND,
} from '../../../src/core/identity/domain/rules/phone-code.ts';
import { nextPhoneCodePurgeAt } from '../../../src/core/identity/domain/rules/phone-code-purge.ts';
import { CryptoVerificationCodeSource } from '../../../src/core/identity/infrastructure/node/crypto-verification-code-source.ts';
import { AttemptSeriesEntity } from '../../../src/core/throttle/domain/entities/attempt-series.entity.ts';
import { defineAttemptRule } from '../../../src/core/throttle/domain/rules/attempt-rule.ts';
import {
    defineRateLimit,
    takeToken,
} from '../../../src/core/throttle/domain/rules/rate-limit.ts';

const NOW = new Date('2026-10-09T09:00:00.000Z');
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const SAMPLES = 200;

const after = (durationMs: number): Date =>
    new Date(NOW.getTime() + durationMs);

describe('rules of the resident code', () => {
    it('lives ten minutes, is sent again after a minute and waits thirty minutes for the consent', () => {
        expect(CODE_LIFETIME_SECONDS).toBe(600);
        expect(CODE_RESEND_SECONDS).toBe(60);
        expect(PENDING_LIFETIME_SECONDS).toBe(1800);
    });

    it('closes the entry of the phone for fifteen minutes on the fifth wrong code', () => {
        const rule = defineAttemptRule(RESIDENT_CODE_ATTEMPTS);
        const series = AttemptSeriesEntity.open({
            id: '00000000-0000-7000-8000-000000000001',
            key: 'fingerprint',
            now: NOW,
        });

        for (let attempt = 0; attempt < 4; attempt += 1) {
            expect(series.register(rule, NOW)).toEqual({
                isCounted: true,
                retryAfterSeconds: null,
            });
        }
        expect(series.register(rule, NOW)).toEqual({
            isCounted: true,
            retryAfterSeconds: 900,
        });
        expect(series.register(rule, after(15 * MINUTE_MS - 1))).toEqual({
            isCounted: false,
            retryAfterSeconds: 1,
        });
        expect(series.register(rule, after(15 * MINUTE_MS))).toEqual({
            isCounted: true,
            retryAfterSeconds: null,
        });
    });

    it('refuses to send the code again earlier than in sixty seconds', () => {
        const pause = defineRateLimit(RESIDENT_CODE_RESEND);
        const first = takeToken(pause, null, NOW);
        const fullAt = first.isTaken ? first.fullAt : null;

        expect(first.isTaken).toBe(true);
        expect(takeToken(pause, fullAt, after(SECOND_MS))).toEqual({
            isTaken: false,
            retryAfterSeconds: 59,
        });
        expect(takeToken(pause, fullAt, after(60 * SECOND_MS - 1))).toEqual({
            isTaken: false,
            retryAfterSeconds: 1,
        });
        expect(takeToken(pause, fullAt, after(60 * SECOND_MS)).isTaken).toBe(
            true,
        );
    });

    it('draws six digits, leading zeros included', () => {
        const source = new CryptoVerificationCodeSource();
        const codes = Array.from({ length: SAMPLES }, () => source.next());

        expect(codes.every((code) => CODE_PATTERN.test(code))).toBe(true);
        expect(new Set(codes).size).toBeGreaterThan(SAMPLES / 2);
    });

    it('purges expired codes in the next five-minute slot', () => {
        expect(nextPhoneCodePurgeAt(NOW)).toEqual(after(5 * MINUTE_MS));
        expect(nextPhoneCodePurgeAt(after(4 * MINUTE_MS + 45_000))).toEqual(
            after(10 * MINUTE_MS),
        );
    });
});

describe('fixed code of the lab', () => {
    it('works only in the lab', () => {
        expect(fixedCodeFor('lab', '000000')).toBe('000000');
        expect(fixedCodeFor('production', '000000')).toBeNull();
        expect(fixedCodeFor('e2e', '000000')).toBeNull();
        expect(fixedCodeFor(undefined, '000000')).toBeNull();
    });

    it('is off when it is not set or is not six digits', () => {
        expect(fixedCodeFor('lab', undefined)).toBeNull();
        expect(fixedCodeFor('lab', '')).toBeNull();
        expect(fixedCodeFor('lab', '12345')).toBeNull();
        expect(fixedCodeFor('lab', 'abcdef')).toBeNull();
    });
});
