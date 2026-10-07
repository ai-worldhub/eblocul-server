export type RecordedEvent = {
    level: 'info' | 'warn' | 'error';
    event: string;
    fields: unknown;
};

export class EventLoggerDouble {
    readonly records: RecordedEvent[] = [];

    requestId(): string | null {
        return null;
    }

    info(event: string, fields: unknown): void {
        this.records.push({ level: 'info', event, fields });
    }

    warn(event: string, fields: unknown): void {
        this.records.push({ level: 'warn', event, fields });
    }

    error(event: string, fields: unknown): void {
        this.records.push({ level: 'error', event, fields });
    }
}
