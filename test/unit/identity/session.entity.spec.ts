import {
    type SessionApplication,
    SessionEntity,
    sessionIdleSeconds,
} from '../../../src/core/identity/domain/entities/session.entity.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const STARTED_AT = new Date('2026-10-07T09:00:00.000Z');

const after = (durationMs: number): Date =>
    new Date(STARTED_AT.getTime() + durationMs);

const start = (
    application: SessionApplication = 'admin_panel',
): SessionEntity =>
    SessionEntity.start({
        id: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10',
        accountId: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11',
        tokenHash: 'fingerprint',
        application,
        now: STARTED_AT,
    });

describe('SessionEntity', () => {
    it('binds the transport to the application that started the session', () => {
        expect(start('admin_panel').view().transport).toBe('cookie');
        expect(start('guard_panel').view().transport).toBe('cookie');
        expect(start('resident_app').view().transport).toBe('header');
    });

    it('lives thirty days without activity for the administration panel', () => {
        const session = start();

        expect(session.isActive(after(30 * DAY_MS - 1))).toBe(true);
        expect(session.isActive(after(30 * DAY_MS))).toBe(false);
        expect(sessionIdleSeconds('admin_panel')).toBe(2_592_000);
    });

    it('lives ninety days without activity for the resident application', () => {
        const session = start('resident_app');

        expect(session.isActive(after(90 * DAY_MS - 1))).toBe(true);
        expect(session.isActive(after(90 * DAY_MS))).toBe(false);
    });

    it('refuses an expired session', () => {
        expect(() => {
            start().authenticate('cookie', after(30 * DAY_MS));
        }).toThrow(
            expect.objectContaining({ code: 'IDENTITY_SESSION_REQUIRED' }),
        );
    });

    it('refuses a session presented by the other transport', () => {
        expect(() => {
            start().authenticate('header', after(HOUR_MS));
        }).toThrow(
            expect.objectContaining({ code: 'IDENTITY_SESSION_REQUIRED' }),
        );
        expect(() => {
            start().authenticate('cookie', after(HOUR_MS));
        }).not.toThrow();
    });

    it('does not renew more often than once a day', () => {
        const session = start();

        expect(session.isRenewalDue(after(DAY_MS - 1))).toBe(false);
        expect(session.renew(after(DAY_MS - 1))).toBe(false);
        expect(session.view().lastActiveAt).toEqual(STARTED_AT);
        expect(session.view().expiresAt).toEqual(after(30 * DAY_MS));
    });

    it('slides the deadline from the last activity once a day has passed', () => {
        const session = start();

        expect(session.renew(after(DAY_MS))).toBe(true);

        expect(session.view().lastActiveAt).toEqual(after(DAY_MS));
        expect(session.view().expiresAt).toEqual(after(31 * DAY_MS));
        expect(session.isActive(after(30 * DAY_MS))).toBe(true);
        expect(session.renew(after(DAY_MS + HOUR_MS))).toBe(false);
    });

    it('does not revive an expired session', () => {
        const session = start();

        expect(session.renew(after(30 * DAY_MS))).toBe(false);
        expect(session.isActive(after(30 * DAY_MS))).toBe(false);
    });

    it('ends once and refuses afterwards', () => {
        const session = start();

        expect(session.end('header', after(HOUR_MS))).toBe(false);
        expect(session.end('cookie', after(HOUR_MS))).toBe(true);
        expect(session.view().endedAt).toEqual(after(HOUR_MS));
        expect(session.end('cookie', after(2 * HOUR_MS))).toBe(false);
        expect(session.isActive(after(2 * HOUR_MS))).toBe(false);
        expect(session.renew(after(2 * DAY_MS))).toBe(false);
    });
});
