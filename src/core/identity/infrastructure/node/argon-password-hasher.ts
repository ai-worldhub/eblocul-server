import { Injectable } from '@nestjs/common';
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../../ports/password-hasher.port.ts';

const ALGORITHM = 'argon2id';
const VERSION = 19;
const MEMORY_KIB = 65_536;
const PASSES = 3;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 32;

const ENCODED =
    /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

type Parameters = {
    memory: number;
    passes: number;
    parallelism: number;
};

type Decoded = Parameters & {
    version: number;
    salt: Buffer;
    tag: Buffer;
};

const CURRENT: Parameters = {
    memory: MEMORY_KIB,
    passes: PASSES,
    parallelism: PARALLELISM,
};

const unpadded = (bytes: Buffer): string =>
    bytes.toString('base64').replaceAll('=', '');

const derive = (
    password: string,
    salt: Buffer,
    parameters: Parameters,
    tagLength: number,
): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        argon2(
            ALGORITHM,
            {
                message: Buffer.from(password, 'utf8'),
                nonce: salt,
                tagLength,
                ...parameters,
            },
            (error, tag) => {
                if (error === null) {
                    resolve(tag);
                } else {
                    reject(error);
                }
            },
        );
    });

const decode = (encoded: string): Decoded | null => {
    const match = ENCODED.exec(encoded);
    if (match === null) {
        return null;
    }
    const [, version, memory, passes, parallelism, salt = '', tag = ''] = match;
    return {
        version: Number(version),
        memory: Number(memory),
        passes: Number(passes),
        parallelism: Number(parallelism),
        salt: Buffer.from(salt, 'base64'),
        tag: Buffer.from(tag, 'base64'),
    };
};

@Injectable()
export class ArgonPasswordHasher implements PasswordHasher {
    async hash(password: string): Promise<string> {
        const salt = randomBytes(SALT_BYTES);
        const tag = await derive(password, salt, CURRENT, TAG_BYTES);
        const { memory, passes, parallelism } = CURRENT;
        return `$${ALGORITHM}$v=${VERSION}$m=${memory},t=${passes},p=${parallelism}$${unpadded(salt)}$${unpadded(tag)}`;
    }

    async verify(password: string, hash: string): Promise<boolean> {
        const decoded = decode(hash);
        if (decoded === null || decoded.version !== VERSION) {
            return false;
        }
        const { salt, tag, memory, passes, parallelism } = decoded;
        const actual = await derive(
            password,
            salt,
            { memory, passes, parallelism },
            tag.length,
        );
        return timingSafeEqual(actual, tag);
    }

    needsRehash(hash: string): boolean {
        const decoded = decode(hash);
        return (
            decoded === null ||
            decoded.version !== VERSION ||
            decoded.memory !== CURRENT.memory ||
            decoded.passes !== CURRENT.passes ||
            decoded.parallelism !== CURRENT.parallelism ||
            decoded.tag.length !== TAG_BYTES
        );
    }
}
