import type { VerificationCodeSender } from '../../ports/verification-code-sender.port.ts';

export class SilentVerificationCodeSender implements VerificationCodeSender {
    send(): Promise<void> {
        return Promise.resolve();
    }
}
