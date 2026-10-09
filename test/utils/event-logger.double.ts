import type { EventLogger } from '../../src/shared/logging/event-logger.ts';
import type { LogEvents } from '../../src/shared/logging/log-events.ts';

export type RecordedEvent = { event: string; fields: unknown };

export class EventLoggerDouble implements Pick<
    EventLogger,
    'requestId' | 'info' | 'warn' | 'error'
> {
    private _events: RecordedEvent[] = [];

    requestId(): string | null {
        return null;
    }

    info<E extends keyof LogEvents>(event: E, fields: LogEvents[E]): void {
        this._events.push({ event, fields });
    }

    warn<E extends keyof LogEvents>(event: E, fields: LogEvents[E]): void {
        this._events.push({ event, fields });
    }

    error<E extends keyof LogEvents>(event: E, fields: LogEvents[E]): void {
        this._events.push({ event, fields });
    }

    named(prefix: string): RecordedEvent[] {
        return this._events.filter(({ event }) => event.startsWith(prefix));
    }

    clear(): void {
        this._events = [];
    }
}
