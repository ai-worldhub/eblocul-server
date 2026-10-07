import { IdentityError } from './identity.errors.ts';

const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

export type PasswordRule = 'min_length' | 'max_length' | 'letter' | 'digit';

export const brokenPasswordRules = (password: string): PasswordRule[] => {
    const length = Array.from(password).length;
    const broken: PasswordRule[] = [];
    if (length < PASSWORD_MIN_LENGTH) {
        broken.push('min_length');
    }
    if (length > PASSWORD_MAX_LENGTH) {
        broken.push('max_length');
    }
    if (!LETTER.test(password)) {
        broken.push('letter');
    }
    if (!DIGIT.test(password)) {
        broken.push('digit');
    }
    return broken;
};

export const assertPasswordAcceptable = (password: string): void => {
    const rules = brokenPasswordRules(password);
    if (rules.length > 0) {
        throw new IdentityError(
            'IDENTITY_PASSWORD_WEAK',
            'Password does not meet the password rules',
            { rules },
        );
    }
};
