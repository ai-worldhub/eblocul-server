import { IdentityError } from '../../../src/core/identity/domain/identity.errors.ts';
import {
    assertPasswordAcceptable,
    brokenPasswordRules,
} from '../../../src/core/identity/domain/rules/password-policy.ts';

describe('password policy', () => {
    it('accepts ten characters with letters and digits', () => {
        expect(brokenPasswordRules('abcdefgh12')).toEqual([]);
        expect(() => {
            assertPasswordAcceptable('parolă-nouă-2026');
        }).not.toThrow();
    });

    it('rejects a password shorter than ten characters', () => {
        expect(brokenPasswordRules('abcdefg12')).toEqual(['min_length']);
    });

    it('rejects a password without letters', () => {
        expect(brokenPasswordRules('1234567890')).toEqual(['letter']);
    });

    it('rejects a password without digits', () => {
        expect(brokenPasswordRules('abcdefghij')).toEqual(['digit']);
    });

    it('rejects a password longer than the sign-in form accepts', () => {
        expect(brokenPasswordRules(`a1${'x'.repeat(255)}`)).toEqual([
            'max_length',
        ]);
    });

    it('names the broken rules and never the password itself', () => {
        const refusal = (): unknown => {
            try {
                assertPasswordAcceptable('short');
                return null;
            } catch (error) {
                return error;
            }
        };

        const error = refusal();

        expect(error).toBeInstanceOf(IdentityError);
        expect(error).toMatchObject({
            code: 'IDENTITY_PASSWORD_WEAK',
            details: { rules: ['min_length', 'digit'] },
        });
        expect(JSON.stringify(error)).not.toContain('short');
    });
});
