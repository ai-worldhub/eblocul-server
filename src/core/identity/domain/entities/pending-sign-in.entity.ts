import { IdentityError } from '../identity.errors.ts';
import { PENDING_LIFETIME_SECONDS } from '../rules/phone-code.ts';
import type { ProfileLanguage } from '../rules/profile-language.ts';

const SECOND_MS = 1000;

export type PendingSignInSnapshot = {
    id: string;
    phone: string;
    tokenHash: string;
    language: ProfileLanguage;
    confirmedAt: Date;
    expiresAt: Date;
};

export const pendingTokenInvalid = (): IdentityError =>
    new IdentityError(
        'IDENTITY_PENDING_TOKEN_INVALID',
        'Pending token is unknown or has expired, sign in again',
    );

export class PendingSignInEntity {
    private constructor(private readonly snapshot: PendingSignInSnapshot) {}

    static open(input: {
        id: string;
        phone: string;
        tokenHash: string;
        language: ProfileLanguage;
        now: Date;
    }): PendingSignInEntity {
        return new PendingSignInEntity({
            id: input.id,
            phone: input.phone,
            tokenHash: input.tokenHash,
            language: input.language,
            confirmedAt: input.now,
            expiresAt: new Date(
                input.now.getTime() + PENDING_LIFETIME_SECONDS * SECOND_MS,
            ),
        });
    }

    static restore(snapshot: PendingSignInSnapshot): PendingSignInEntity {
        return new PendingSignInEntity(snapshot);
    }

    view(): PendingSignInSnapshot {
        return { ...this.snapshot };
    }

    assertOpen(now: Date): void {
        if (now.getTime() >= this.snapshot.expiresAt.getTime()) {
            throw pendingTokenInvalid();
        }
    }
}
