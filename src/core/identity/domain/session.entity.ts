import { IdentityError } from './identity.errors.ts';

export type SessionApplication = 'admin_panel' | 'guard_panel' | 'resident_app';
export type SessionTransport = 'cookie' | 'header';

const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;

const SESSION_IDLE_DAYS: Record<SessionApplication, number> = {
    admin_panel: 30,
    guard_panel: 30,
    resident_app: 90,
};

const SESSION_TRANSPORTS: Record<SessionApplication, SessionTransport> = {
    admin_panel: 'cookie',
    guard_panel: 'cookie',
    resident_app: 'header',
};

const RENEWAL_INTERVAL_MS = DAY_MS;

export type SessionSnapshot = {
    id: string;
    accountId: string;
    tokenHash: string;
    application: SessionApplication;
    transport: SessionTransport;
    createdAt: Date;
    lastActiveAt: Date;
    expiresAt: Date;
    endedAt: Date | null;
};

export type SessionContext = {
    sessionId: string;
    accountId: string;
    application: SessionApplication;
};

export const sessionRequired = (): IdentityError =>
    new IdentityError('IDENTITY_SESSION_REQUIRED', 'Session is required');

export const sessionIdleSeconds = (application: SessionApplication): number =>
    SESSION_IDLE_DAYS[application] * DAY_SECONDS;

const idleDeadline = (application: SessionApplication, now: Date): Date =>
    new Date(now.getTime() + SESSION_IDLE_DAYS[application] * DAY_MS);

export class SessionEntity {
    private constructor(private snapshot: SessionSnapshot) {}

    static start(input: {
        id: string;
        accountId: string;
        tokenHash: string;
        application: SessionApplication;
        now: Date;
    }): SessionEntity {
        return new SessionEntity({
            id: input.id,
            accountId: input.accountId,
            tokenHash: input.tokenHash,
            application: input.application,
            transport: SESSION_TRANSPORTS[input.application],
            createdAt: input.now,
            lastActiveAt: input.now,
            expiresAt: idleDeadline(input.application, input.now),
            endedAt: null,
        });
    }

    static restore(snapshot: SessionSnapshot): SessionEntity {
        return new SessionEntity(snapshot);
    }

    view(): SessionSnapshot {
        return { ...this.snapshot };
    }

    context(): SessionContext {
        return {
            sessionId: this.snapshot.id,
            accountId: this.snapshot.accountId,
            application: this.snapshot.application,
        };
    }

    isActive(now: Date): boolean {
        return (
            this.snapshot.endedAt === null &&
            now.getTime() < this.snapshot.expiresAt.getTime()
        );
    }

    authenticate(transport: SessionTransport, now: Date): void {
        if (transport !== this.snapshot.transport || !this.isActive(now)) {
            throw sessionRequired();
        }
    }

    isRenewalDue(now: Date): boolean {
        return (
            now.getTime() - this.snapshot.lastActiveAt.getTime() >=
            RENEWAL_INTERVAL_MS
        );
    }

    renew(now: Date): boolean {
        if (!this.isActive(now) || !this.isRenewalDue(now)) {
            return false;
        }
        this.snapshot = {
            ...this.snapshot,
            lastActiveAt: now,
            expiresAt: idleDeadline(this.snapshot.application, now),
        };
        return true;
    }

    end(transport: SessionTransport, now: Date): boolean {
        if (transport !== this.snapshot.transport || !this.isActive(now)) {
            return false;
        }
        this.snapshot = { ...this.snapshot, endedAt: now };
        return true;
    }
}
