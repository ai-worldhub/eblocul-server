import { createHash } from 'node:crypto';

export const fingerprintOf = (token: string): string =>
    createHash('sha256').update(token).digest('hex');
