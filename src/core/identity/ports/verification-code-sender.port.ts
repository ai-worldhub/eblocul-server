export abstract class VerificationCodeSender {
    abstract send(phone: string, code: string): Promise<void>;
}
