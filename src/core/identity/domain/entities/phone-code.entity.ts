import { IdentityError } from '../identity.errors.ts';
import {
    CODE_LIFETIME_SECONDS,
    PENDING_LIFETIME_SECONDS,
} from '../rules/phone-code.ts';

const SECOND_MS = 1000;

export type PhoneCodeSnapshot = {
    id: string;
    phone: string;
    codeHash: string;
    pendingTokenHash: string | null;
    createdAt: Date;
    expiresAt: Date;
    confirmedAt: Date | null;
};

export type CodeVerdict = 'matched' | 'invalid' | 'expired';

const after = (now: Date, seconds: number): Date =>
    new Date(now.getTime() + seconds * SECOND_MS);

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

export const pendingTokenInvalid = (): IdentityError =>
    new IdentityError(
        'IDENTITY_PENDING_TOKEN_INVALID',
        'Pending token is unknown or has expired, sign in again',
    );

export class PhoneCodeEntity {
    private constructor(private snapshot: PhoneCodeSnapshot) {}

    static issue(input: {
        id: string;
        phone: string;
        codeHash: string;
        now: Date;
    }): PhoneCodeEntity {
        return new PhoneCodeEntity({
            id: input.id,
            phone: input.phone,
            codeHash: input.codeHash,
            pendingTokenHash: null,
            createdAt: input.now,
            expiresAt: after(input.now, CODE_LIFETIME_SECONDS),
            confirmedAt: null,
        });
    }

    static restore(snapshot: PhoneCodeSnapshot): PhoneCodeEntity {
        return new PhoneCodeEntity(snapshot);
    }

    view(): PhoneCodeSnapshot {
        return { ...this.snapshot };
    }

    verdictOn(codeHash: string, now: Date): CodeVerdict {
        if (this.snapshot.confirmedAt !== null) {
            return 'invalid';
        }
        if (now.getTime() >= this.snapshot.expiresAt.getTime()) {
            return 'expired';
        }
        return isSameFingerprint(codeHash, this.snapshot.codeHash)
            ? 'matched'
            : 'invalid';
    }

    confirm(codeHash: string, now: Date): void {
        const verdict = this.verdictOn(codeHash, now);
        if (verdict !== 'matched') {
            throw codeRefused(verdict);
        }
        this.snapshot = { ...this.snapshot, confirmedAt: now };
    }

    keepPending(pendingTokenHash: string, now: Date): void {
        if (
            this.snapshot.confirmedAt === null ||
            this.snapshot.pendingTokenHash !== null
        ) {
            throw pendingTokenInvalid();
        }
        this.snapshot = {
            ...this.snapshot,
            pendingTokenHash,
            expiresAt: after(now, PENDING_LIFETIME_SECONDS),
        };
    }

    redeem(now: Date): Date {
        const { confirmedAt, pendingTokenHash, expiresAt } = this.snapshot;
        if (
            confirmedAt === null ||
            pendingTokenHash === null ||
            now.getTime() >= expiresAt.getTime()
        ) {
            throw pendingTokenInvalid();
        }
        return confirmedAt;
    }
}
