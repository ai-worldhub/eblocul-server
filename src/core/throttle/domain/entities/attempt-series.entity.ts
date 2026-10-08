import type { AttemptRule } from '../rules/attempt-rule.ts';

const SECOND_MS = 1000;

export type AttemptSeriesSnapshot = {
    id: string;
    key: string;
    failures: number;
    lockEndsAt: Date | null;
    expiresAt: Date;
};

export type AttemptOutcome = {
    isCounted: boolean;
    retryAfterSeconds: number | null;
};

const after = (now: Date, seconds: number): Date =>
    new Date(now.getTime() + seconds * SECOND_MS);

export class AttemptSeriesEntity {
    private constructor(private snapshot: AttemptSeriesSnapshot) {}

    static open(input: {
        id: string;
        key: string;
        now: Date;
    }): AttemptSeriesEntity {
        return new AttemptSeriesEntity({
            id: input.id,
            key: input.key,
            failures: 0,
            lockEndsAt: null,
            expiresAt: input.now,
        });
    }

    static restore(snapshot: AttemptSeriesSnapshot): AttemptSeriesEntity {
        return new AttemptSeriesEntity(snapshot);
    }

    view(): AttemptSeriesSnapshot {
        return { ...this.snapshot };
    }

    register(rule: AttemptRule, now: Date): AttemptOutcome {
        const { lockEndsAt, expiresAt } = this.snapshot;
        if (lockEndsAt !== null && now.getTime() < lockEndsAt.getTime()) {
            return {
                isCounted: false,
                retryAfterSeconds: Math.ceil(
                    (lockEndsAt.getTime() - now.getTime()) / SECOND_MS,
                ),
            };
        }
        const failures =
            (now.getTime() < expiresAt.getTime() ? this.snapshot.failures : 0) +
            1;
        if (failures >= rule.maxFailures) {
            const lockedUntil = after(now, rule.lockSeconds);
            this.snapshot = {
                ...this.snapshot,
                failures,
                lockEndsAt: lockedUntil,
                expiresAt: lockedUntil,
            };
            return { isCounted: true, retryAfterSeconds: rule.lockSeconds };
        }
        this.snapshot = {
            ...this.snapshot,
            failures,
            lockEndsAt: null,
            expiresAt: after(now, rule.forgetAfterSeconds),
        };
        return { isCounted: true, retryAfterSeconds: null };
    }
}
