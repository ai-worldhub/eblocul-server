import { PendingSignInEntity } from '../../../src/core/identity/domain/entities/pending-sign-in.entity.ts';
import { PhoneCodeEntity } from '../../../src/core/identity/domain/entities/phone-code.entity.ts';

const MINUTE_MS = 60_000;
const ISSUED_AT = new Date('2026-10-09T09:00:00.000Z');
const CODE_HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const TOKEN_HASH = 'c'.repeat(64);

const after = (durationMs: number): Date =>
    new Date(ISSUED_AT.getTime() + durationMs);

const issue = (): PhoneCodeEntity =>
    PhoneCodeEntity.issue({
        id: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10',
        phone: '+37369123456',
        codeHash: CODE_HASH,
        language: 'ro',
        now: ISSUED_AT,
    });

describe('PhoneCodeEntity', () => {
    it('lives ten minutes', () => {
        const code = issue();

        expect(code.verdictOn(CODE_HASH, after(10 * MINUTE_MS - 1))).toBe(
            'matched',
        );
        expect(code.verdictOn(CODE_HASH, after(10 * MINUTE_MS))).toBe(
            'expired',
        );
        expect(code.view().expiresAt).toEqual(after(10 * MINUTE_MS));
    });

    it('tells a wrong code from an expired one', () => {
        const code = issue();

        expect(code.verdictOn(OTHER_HASH, after(MINUTE_MS))).toBe('invalid');
        expect(code.verdictOn(OTHER_HASH, after(10 * MINUTE_MS))).toBe(
            'expired',
        );
        expect(code.verdictOn('', after(MINUTE_MS))).toBe('invalid');
        expect(code.verdictOn(`${CODE_HASH}a`, after(MINUTE_MS))).toBe(
            'invalid',
        );
    });

    it('refuses a wrong or an expired code', () => {
        expect(() => {
            issue().assertMatches(OTHER_HASH, after(MINUTE_MS));
        }).toThrow(expect.objectContaining({ code: 'IDENTITY_CODE_INVALID' }));
        expect(() => {
            issue().assertMatches(CODE_HASH, after(10 * MINUTE_MS));
        }).toThrow(expect.objectContaining({ code: 'IDENTITY_CODE_EXPIRED' }));
        expect(() => {
            issue().assertMatches(CODE_HASH, after(MINUTE_MS));
        }).not.toThrow();
    });

    it('remembers the language the code was asked in', () => {
        expect(issue().view().language).toBe('ro');
    });
});

describe('PendingSignInEntity', () => {
    const open = (): PendingSignInEntity =>
        PendingSignInEntity.open({
            id: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11',
            phone: '+37369123456',
            tokenHash: TOKEN_HASH,
            language: 'ru',
            now: after(9 * MINUTE_MS),
        });

    it('keeps a confirmed phone for thirty minutes until the consent', () => {
        const pending = open();

        expect(pending.view()).toEqual({
            id: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11',
            phone: '+37369123456',
            tokenHash: TOKEN_HASH,
            language: 'ru',
            confirmedAt: after(9 * MINUTE_MS),
            expiresAt: after(39 * MINUTE_MS),
        });
        expect(() => {
            pending.assertOpen(after(39 * MINUTE_MS - 1));
        }).not.toThrow();
    });

    it('does not finish a sign-in after the thirty minutes', () => {
        expect(() => {
            open().assertOpen(after(39 * MINUTE_MS));
        }).toThrow(
            expect.objectContaining({ code: 'IDENTITY_PENDING_TOKEN_INVALID' }),
        );
    });
});
