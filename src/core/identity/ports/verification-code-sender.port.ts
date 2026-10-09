import type { ProfileLanguage } from '../domain/rules/profile-language.ts';

export type CodeDelivery = {
    phone: string;
    code: string;
    language: ProfileLanguage;
};

export abstract class VerificationCodeSender {
    abstract send(delivery: CodeDelivery): Promise<void>;
}
