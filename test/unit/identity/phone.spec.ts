import { normalizePhone } from '../../../src/core/identity/domain/rules/phone.ts';

const STORED = '+37369123456';

describe('normalizePhone', () => {
    it('stores every written form of a Moldovan number as one +373 number', () => {
        for (const written of [
            '069123456',
            '69123456',
            '+37369123456',
            '0037369123456',
            '069 123 456',
            '069.123.456',
            '069-123-456',
            ' +373 69 123 456 ',
            '00373 69-123.456',
        ]) {
            expect(normalizePhone(written)).toBe(STORED);
        }
        expect(normalizePhone('079123456')).toBe('+37379123456');
    });

    it('refuses a number that is too short or too long', () => {
        for (const written of [
            '',
            '06912345',
            '6912345',
            '0691234567',
            '+373691234567',
            '+3736912345',
        ]) {
            expect(() => normalizePhone(written)).toThrow(
                expect.objectContaining({ code: 'IDENTITY_PHONE_INVALID' }),
            );
        }
    });

    it('refuses a number that does not start with 6 or 7', () => {
        for (const written of ['022123456', '+37322123456', '89123456']) {
            expect(() => normalizePhone(written)).toThrow(
                expect.objectContaining({ code: 'IDENTITY_PHONE_INVALID' }),
            );
        }
    });

    it('refuses a Romanian number and any other country', () => {
        for (const written of [
            '+40721234567',
            '0040721234567',
            '0721234567',
            '+380671234567',
            '37369123456',
        ]) {
            expect(() => normalizePhone(written)).toThrow(
                expect.objectContaining({ code: 'IDENTITY_PHONE_INVALID' }),
            );
        }
    });

    it('refuses letters and signs inside the number', () => {
        for (const written of ['06912345a', '+373(69)123456', '069/123/456']) {
            expect(() => normalizePhone(written)).toThrow(
                expect.objectContaining({ code: 'IDENTITY_PHONE_INVALID' }),
            );
        }
    });

    it('keeps the phone out of the refusal', () => {
        try {
            normalizePhone('+40721234567');
            expect.unreachable();
        } catch (error) {
            expect(JSON.stringify(error)).not.toContain('40721234567');
            expect((error as Error).message).not.toContain('40721234567');
        }
    });
});
