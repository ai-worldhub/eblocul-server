import type { Clock } from '../../src/shared/clock/clock.service.ts';

export class ClockDouble implements Clock {
    private _current: Date;

    constructor(start: Date) {
        this._current = new Date(start);
    }

    now(): Date {
        return new Date(this._current);
    }

    advance(durationMs: number): void {
        this._current = new Date(this._current.getTime() + durationMs);
    }
}
