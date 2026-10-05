import { Injectable } from '@nestjs/common';
import type { RetryJitter } from '../../ports/retry-jitter.port.ts';

@Injectable()
export class MathRetryJitter implements RetryJitter {
    next(): number {
        return Math.random();
    }
}
