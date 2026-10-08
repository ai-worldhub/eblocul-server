import { IdentityError } from '../identity.errors.ts';

const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

const lengthOf = (password: string): number => Array.from(password).length;

export type PasswordRule = 'min_length' | 'max_length' | 'letter' | 'digit';

type RuleCheck = readonly [PasswordRule, (password: string) => boolean];

const RULES: readonly RuleCheck[] = [
    ['min_length', (password) => lengthOf(password) >= PASSWORD_MIN_LENGTH],
    ['max_length', (password) => lengthOf(password) <= PASSWORD_MAX_LENGTH],
    ['letter', (password) => LETTER.test(password)],
    ['digit', (password) => DIGIT.test(password)],
];

export const brokenPasswordRules = (password: string): PasswordRule[] =>
    RULES.filter(([, holds]) => !holds(password)).map(([rule]) => rule);

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
