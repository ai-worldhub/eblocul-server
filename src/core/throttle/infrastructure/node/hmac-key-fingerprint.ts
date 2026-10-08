import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { KeyFingerprint } from '../../ports/key-fingerprint.port.ts';

const SEPARATOR = '\n';

@Injectable()
export class HmacKeyFingerprint implements KeyFingerprint {
    private readonly _secret: string;

    constructor(config: ConfigService) {
        this._secret = config.getOrThrow<string>('THROTTLE_KEY_SECRET');
    }

    of(scope: string, subject: string): string {
        return createHmac('sha256', this._secret)
            .update(scope)
            .update(SEPARATOR)
            .update(subject)
            .digest('base64url');
    }
}
