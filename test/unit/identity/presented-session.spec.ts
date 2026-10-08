import { presentedSessionOf } from '../../../src/core/identity/presentation/guard/presented-session.ts';

describe('presentedSessionOf', () => {
    it('finds nothing in a request without a session', () => {
        expect(presentedSessionOf({})).toBeNull();
        expect(presentedSessionOf({ cookie: 'theme=dark' })).toBeNull();
        expect(presentedSessionOf({ cookie: 'eblocul_session=' })).toBeNull();
        expect(presentedSessionOf({ authorization: 'Basic abc' })).toBeNull();
    });

    it('reads the session cookie as the cookie transport', () => {
        expect(
            presentedSessionOf({ cookie: 'theme=dark; eblocul_session=abc' }),
        ).toEqual({ token: 'abc', transport: 'cookie' });
    });

    it('reads the bearer header as the header transport, whatever its case', () => {
        for (const authorization of [
            'Bearer abc',
            'bearer abc',
            'BEARER  abc',
        ]) {
            expect(presentedSessionOf({ authorization })).toEqual({
                token: 'abc',
                transport: 'header',
            });
        }
    });

    it('refuses a request that carries the cookie and any Authorization header', () => {
        for (const authorization of [
            'Bearer abc',
            'bearer abc',
            'Basic abc',
            'Bearer abc ',
        ]) {
            expect(() =>
                presentedSessionOf({
                    cookie: 'eblocul_session=abc',
                    authorization,
                }),
            ).toThrow(
                expect.objectContaining({ code: 'IDENTITY_SESSION_REQUIRED' }),
            );
        }
    });
});
