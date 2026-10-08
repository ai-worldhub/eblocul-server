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

    it('reads the bearer header as the header transport', () => {
        expect(presentedSessionOf({ authorization: 'Bearer abc' })).toEqual({
            token: 'abc',
            transport: 'header',
        });
    });

    it('refuses a request that presents a session both ways', () => {
        expect(() =>
            presentedSessionOf({
                cookie: 'eblocul_session=abc',
                authorization: 'Bearer abc',
            }),
        ).toThrow(
            expect.objectContaining({ code: 'IDENTITY_SESSION_REQUIRED' }),
        );
    });
});
