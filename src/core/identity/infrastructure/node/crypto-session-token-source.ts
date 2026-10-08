import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { SessionTokenSource } from '../../ports/session-token-source.port.ts';

const TOKEN_BYTES = 32;

@Injectable()
export class CryptoSessionTokenSource implements SessionTokenSource {
    next(): string {
        return randomBytes(TOKEN_BYTES).toString('base64url');
    }
}
