import type { RetryJitter } from '../../src/core/jobs/ports/retry-jitter.port.ts';

export class RetryJitterDouble implements RetryJitter {
    constructor(private readonly _value: number) {}

    next(): number {
        return this._value;
    }
}
