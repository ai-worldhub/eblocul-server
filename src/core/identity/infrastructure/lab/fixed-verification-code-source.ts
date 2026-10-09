import type { VerificationCodeSource } from '../../ports/verification-code-source.port.ts';

export class FixedVerificationCodeSource implements VerificationCodeSource {
    constructor(private readonly _code: string) {}

    next(): string {
        return this._code;
    }
}
