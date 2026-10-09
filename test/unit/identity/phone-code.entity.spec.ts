import { PhoneCodeEntity } from '../../../src/core/identity/domain/entities/phone-code.entity.ts';

const MINUTE_MS = 60_000;
const ISSUED_AT = new Date('2026-10-09T09:00:00.000Z');
const CODE_HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const PENDING_HASH = 'c'.repeat(64);

const after = (durationMs: number): Date =>
    new Date(ISSUED_AT.getTime() + durationMs);

const issue = (): PhoneCodeEntity =>
    PhoneCodeEntity.issue({
        id: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10',
        phone: '+37369123456',
        codeHash: CODE_HASH,
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

    it('refuses to confirm a wrong or an expired code', () => {
        expect(() => {
            issue().confirm(OTHER_HASH, after(MINUTE_MS));
        }).toThrow(expect.objectContaining({ code: 'IDENTITY_CODE_INVALID' }));
        expect(() => {
            issue().confirm(CODE_HASH, after(10 * MINUTE_MS));
        }).toThrow(expect.objectContaining({ code: 'IDENTITY_CODE_EXPIRED' }));
    });

    it('works once: a confirmed code is not accepted again', () => {
        const code = issue();
        code.confirm(CODE_HASH, after(MINUTE_MS));

        expect(code.verdictOn(CODE_HASH, after(2 * MINUTE_MS))).toBe('invalid');
        expect(() => {
            code.confirm(CODE_HASH, after(2 * MINUTE_MS));
        }).toThrow(expect.objectContaining({ code: 'IDENTITY_CODE_INVALID' }));
    });

    it('keeps a confirmed phone for thirty minutes until the consent', () => {
        const code = issue();
        code.confirm(CODE_HASH, after(9 * MINUTE_MS));
        code.keepPending(PENDING_HASH, after(9 * MINUTE_MS));

        expect(code.view()).toMatchObject({
            pendingTokenHash: PENDING_HASH,
            confirmedAt: after(9 * MINUTE_MS),
            expiresAt: after(39 * MINUTE_MS),
        });
        expect(code.redeem(after(39 * MINUTE_MS - 1))).toEqual(
            after(9 * MINUTE_MS),
        );
        expect(() => code.redeem(after(39 * MINUTE_MS))).toThrow(
            expect.objectContaining({ code: 'IDENTITY_PENDING_TOKEN_INVALID' }),
        );
    });

    it('does not finish a sign-in whose code was never confirmed', () => {
        const code = issue();

        expect(() => code.redeem(after(MINUTE_MS))).toThrow(
            expect.objectContaining({ code: 'IDENTITY_PENDING_TOKEN_INVALID' }),
        );
        expect(() => {
            code.keepPending(PENDING_HASH, after(MINUTE_MS));
        }).toThrow(
            expect.objectContaining({ code: 'IDENTITY_PENDING_TOKEN_INVALID' }),
        );
    });

    it('gives one pending token per confirmed code', () => {
        const code = issue();
        code.confirm(CODE_HASH, after(MINUTE_MS));
        code.keepPending(PENDING_HASH, after(MINUTE_MS));

        expect(() => {
            code.keepPending(OTHER_HASH, after(2 * MINUTE_MS));
        }).toThrow(
            expect.objectContaining({ code: 'IDENTITY_PENDING_TOKEN_INVALID' }),
        );
    });
});
