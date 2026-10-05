import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { LogEvents } from './log-events.ts';

const stackFrames = (error: Error): string | null => {
    const lines = error.stack?.split('\n');
    const header = error.message.split('\n');
    if (lines?.[0]?.endsWith(header[0] ?? '') !== true) {
        return null;
    }
    const tail = lines.slice(1, header.length);
    if (tail.some((line, index) => line !== header[index + 1])) {
        return null;
    }
    return lines
        .slice(header.length)
        .filter((line) => line.trimStart().startsWith('at '))
        .join('\n');
};

@Injectable()
export class EventLogger {
    constructor(private readonly _pino: PinoLogger) {}

    requestId(): string | null {
        const bindings: Record<string, unknown> = this._pino.logger.bindings();
        const value = bindings['requestId'];
        return typeof value === 'string' ? value : null;
    }

    info<E extends keyof LogEvents>(event: E, fields: LogEvents[E]): void {
        this._pino.info(fields, event);
    }

    warn<E extends keyof LogEvents>(event: E, fields: LogEvents[E]): void {
        this._pino.warn(fields, event);
    }

    error<E extends keyof LogEvents>(
        event: E,
        fields: LogEvents[E],
        error?: Error,
    ): void {
        this._pino.error(
            error === undefined
                ? fields
                : {
                      ...fields,
                      error: { type: error.name, stack: stackFrames(error) },
                  },
            event,
        );
    }
}
