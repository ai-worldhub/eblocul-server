import { OUTDATED_PASSWORD } from '../../factories/identity.factory.ts';
import { ArgonPasswordHasher } from '../../../src/core/identity/infrastructure/node/argon-password-hasher.ts';

const PASSWORD = OUTDATED_PASSWORD.password;
const OUTDATED = OUTDATED_PASSWORD.hash;

describe('ArgonPasswordHasher', () => {
    const hasher = new ArgonPasswordHasher();

    it('stores the algorithm, its parameters and a fresh salt with the hash', async () => {
        const first = await hasher.hash(PASSWORD);
        const second = await hasher.hash(PASSWORD);

        expect(first).toMatch(
            /^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
        );
        expect(second).not.toBe(first);
        expect(first).not.toContain(PASSWORD);
    });

    it('verifies the password it hashed and no other', async () => {
        const hash = await hasher.hash(PASSWORD);

        expect(await hasher.verify(PASSWORD, hash)).toBe(true);
        expect(await hasher.verify(`${PASSWORD}!`, hash)).toBe(false);
    });

    it('refuses a value that is not a hash', async () => {
        expect(await hasher.verify(PASSWORD, PASSWORD)).toBe(false);
        expect(await hasher.verify(PASSWORD, '')).toBe(false);
    });

    it('refuses a hash whose parameters cannot or must not be computed', async () => {
        const [, , , , salt = '', tag = ''] = OUTDATED.split('$');
        const withParameters = (parameters: string): string =>
            `$argon2id$v=19$${parameters}$${salt}$${tag}`;

        for (const hash of [
            withParameters('m=1,t=1,p=1'),
            withParameters('m=8,t=0,p=1'),
            withParameters('m=8,t=1,p=0'),
            withParameters('m=4194304,t=1,p=1'),
            withParameters('m=8,t=4294967295,p=1'),
            withParameters('m=99999999999999999999,t=1,p=1'),
            `$argon2id$v=19$m=8,t=1,p=1$c2FsdA$${tag}`,
            `$argon2id$v=19$m=8,t=1,p=1$${salt}$dGFn`,
            OUTDATED.replace('v=19', 'v=16'),
        ]) {
            expect(await hasher.verify(PASSWORD, hash)).toBe(false);
            expect(hasher.needsRehash(hash)).toBe(true);
        }
    });

    it('treats the composed and the decomposed spelling of a letter as one password', async () => {
        const hash = await hasher.hash('parol\u0103-nou\u0103-2026');

        expect(await hasher.verify('parola\u0306-noua\u0306-2026', hash)).toBe(
            true,
        );
        expect(await hasher.verify('parola-noua-2026', hash)).toBe(false);
    });

    it('verifies a hash made with other parameters by the parameters in it', async () => {
        expect(await hasher.verify(PASSWORD, OUTDATED)).toBe(true);
        expect(await hasher.verify(`${PASSWORD}!`, OUTDATED)).toBe(false);
    });

    it('asks to rehash only what was hashed with other parameters', async () => {
        expect(hasher.needsRehash(await hasher.hash(PASSWORD))).toBe(false);
        expect(hasher.needsRehash(OUTDATED)).toBe(true);
        expect(hasher.needsRehash('not-a-hash')).toBe(true);
    });
});
