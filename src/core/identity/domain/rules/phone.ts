import { IdentityError } from '../identity.errors.ts';

export const PHONE_INPUT_MAX_LENGTH = 32;

const SEPARATORS = /[\s.-]/g;
const WRITTEN_FORMS = /^(?:\+373|00373|0)?(\d+)$/;
const NATIONAL_NUMBER = /^[67]\d{7}$/;
const COUNTRY_PREFIX = '+373';

const phoneInvalid = (): IdentityError =>
    new IdentityError(
        'IDENTITY_PHONE_INVALID',
        'Phone is not a valid Moldovan number',
    );

export const normalizePhone = (written: string): string => {
    const national = WRITTEN_FORMS.exec(written.replace(SEPARATORS, ''))?.[1];
    if (national === undefined || !NATIONAL_NUMBER.test(national)) {
        throw phoneInvalid();
    }
    return `${COUNTRY_PREFIX}${national}`;
};
