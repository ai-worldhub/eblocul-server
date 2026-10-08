import { ThrottleError } from '../throttle.errors.ts';

const NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export type AttemptRule = {
    readonly name: string;
    readonly maxFailures: number;
    readonly lockSeconds: number;
    readonly forgetAfterSeconds: number;
};

const isWholePositive = (value: number): boolean =>
    Number.isInteger(value) && value >= 1;

export const defineAttemptRule = (input: AttemptRule): AttemptRule => {
    if (
        !NAME_PATTERN.test(input.name) ||
        !isWholePositive(input.maxFailures) ||
        !isWholePositive(input.lockSeconds) ||
        !isWholePositive(input.forgetAfterSeconds)
    ) {
        throw new ThrottleError(
            'THROTTLE_RULE_INVALID',
            'Attempt rule needs a <module>.<what> name and whole positive numbers',
            { name: input.name },
        );
    }
    return {
        name: input.name,
        maxFailures: input.maxFailures,
        lockSeconds: input.lockSeconds,
        forgetAfterSeconds: input.forgetAfterSeconds,
    };
};
