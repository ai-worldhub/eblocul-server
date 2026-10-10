import { IdentityError } from '../identity.errors.ts';
import { CODE_LIFETIME_SECONDS } from '../rules/phone-code.ts';
import type { ProfileLanguage } from '../rules/profile-language.ts';

const SECOND_MS = 1000;

export type PhoneCodeSnapshot = {
    id: string;
    phone: string;
    codeHash: string;
    language: ProfileLanguage;
    createdAt: Date;
    expiresAt: Date;
};

export type CodeVerdict = 'matched' | 'invalid' | 'expired';

const isSameFingerprint = (left: string, right: string): boolean => {
    let difference = left.length ^ right.length;
    for (let index = 0; index < left.length; index += 1) {
        difference |=
            left.charCodeAt(index) ^ right.charCodeAt(index % right.length);
    }
    return difference === 0;
};

export const codeRefused = (verdict: CodeVerdict): IdentityError =>
    verdict === 'expired'
        ? new IdentityError(
              'IDENTITY_CODE_EXPIRED',
              'Code has expired, request a new one',
          )
        : new IdentityError('IDENTITY_CODE_INVALID', 'Code is incorrect');

export class PhoneCodeEntity {
    private constructor(private readonly snapshot: PhoneCodeSnapshot) {}

    static issue(input: {
        id: string;
        phone: string;
        codeHash: string;
        language: ProfileLanguage;
        now: Date;
    }): PhoneCodeEntity {
        return new PhoneCodeEntity({
            id: input.id,
            phone: input.phone,
            codeHash: input.codeHash,
            language: input.language,
            createdAt: input.now,
            expiresAt: new Date(
                input.now.getTime() + CODE_LIFETIME_SECONDS * SECOND_MS,
            ),
        });
    }

    static restore(snapshot: PhoneCodeSnapshot): PhoneCodeEntity {
        return new PhoneCodeEntity(snapshot);
    }

    view(): PhoneCodeSnapshot {
        return { ...this.snapshot };
    }

    verdictOn(codeHash: string, now: Date): CodeVerdict {
        if (now.getTime() >= this.snapshot.expiresAt.getTime()) {
            return 'expired';
        }
        return isSameFingerprint(codeHash, this.snapshot.codeHash)
            ? 'matched'
            : 'invalid';
    }

    assertMatches(codeHash: string, now: Date): void {
        const verdict = this.verdictOn(codeHash, now);
        if (verdict !== 'matched') {
            throw codeRefused(verdict);
        }
    }
}
