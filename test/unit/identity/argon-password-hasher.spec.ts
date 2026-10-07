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
