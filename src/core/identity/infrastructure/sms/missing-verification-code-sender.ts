import { IdentityError } from '../../domain/identity.errors.ts';
import type { VerificationCodeSender } from '../../ports/verification-code-sender.port.ts';

export class MissingVerificationCodeSender implements VerificationCodeSender {
    send(): Promise<void> {
        return Promise.reject(
            new IdentityError(
                'IDENTITY_CODE_CHANNEL_MISSING',
                'No channel delivers verification codes in this environment',
            ),
        );
    }
}
