import type { VerificationCodeSender } from '../../src/core/identity/ports/verification-code-sender.port.ts';
import type { VerificationCodeSource } from '../../src/core/identity/ports/verification-code-source.port.ts';

const CODE_LENGTH = 6;

export class VerificationCodeSourceDouble implements VerificationCodeSource {
    private _drawn = 0;

    next(): string {
        this._drawn += 1;
        return String(this._drawn).padStart(CODE_LENGTH, '1');
    }

    reset(): void {
        this._drawn = 0;
    }
}

export type SentCode = { phone: string; code: string };

export class VerificationCodeSenderDouble implements VerificationCodeSender {
    private _sent: SentCode[] = [];

    send(phone: string, code: string): Promise<void> {
        this._sent.push({ phone, code });
        return Promise.resolve();
    }

    sent(): SentCode[] {
        return [...this._sent];
    }

    lastCodeFor(phone: string): string {
        const code = this._sent.findLast((sent) => sent.phone === phone)?.code;
        if (code === undefined) {
            throw new Error('No code was sent to this phone');
        }
        return code;
    }

    clear(): void {
        this._sent = [];
    }
}
