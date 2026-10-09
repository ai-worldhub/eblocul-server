export type ThrottleRefusalCode =
    'THROTTLE_RATE_LIMITED' | 'THROTTLE_ATTEMPTS_LOCKED';

export type ThrottleFaultCode = 'THROTTLE_RULE_INVALID';

export type ThrottleErrorCode = ThrottleRefusalCode | ThrottleFaultCode;

export class ThrottleError extends Error {
    constructor(
        readonly code: ThrottleErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ThrottleError';
    }
}

export const rateLimited = (retryAfterSeconds: number): ThrottleError =>
    new ThrottleError('THROTTLE_RATE_LIMITED', 'Too many requests', {
        retryAfterSeconds,
    });

export const attemptsLocked = (retryAfterSeconds: number): ThrottleError =>
    new ThrottleError(
        'THROTTLE_ATTEMPTS_LOCKED',
        'Too many wrong attempts, try again later',
        { retryAfterSeconds },
    );
