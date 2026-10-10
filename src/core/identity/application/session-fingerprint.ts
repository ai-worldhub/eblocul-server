import { createHash } from 'node:crypto';

export const fingerprintOf = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

const CODE_SEPARATOR = ':';

export const codeFingerprintOf = (salt: string, code: string): string =>
    fingerprintOf(`${salt}${CODE_SEPARATOR}${code}`);
