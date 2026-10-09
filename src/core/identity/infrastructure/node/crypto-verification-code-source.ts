import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CODE_LENGTH } from '../../domain/rules/phone-code.ts';
import type { VerificationCodeSource } from '../../ports/verification-code-source.port.ts';

const DECIMAL = 10;

@Injectable()
export class CryptoVerificationCodeSource implements VerificationCodeSource {
    next(): string {
        return String(randomInt(DECIMAL ** CODE_LENGTH)).padStart(
            CODE_LENGTH,
            '0',
        );
    }
}
