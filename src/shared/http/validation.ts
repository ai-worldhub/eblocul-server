import { BadRequestException, type ValidationError } from '@nestjs/common';

type FieldViolation = {
    path: string;
    rules: string[];
};

export const collectViolations = (
    errors: ValidationError[],
    parent = '',
): FieldViolation[] =>
    errors.flatMap((error) => {
        const path =
            parent === '' ? error.property : `${parent}.${error.property}`;
        const own =
            error.constraints === undefined
                ? []
                : [{ path, rules: Object.keys(error.constraints) }];
        return [...own, ...collectViolations(error.children ?? [], path)];
    });

export const toValidationException = (
    errors: ValidationError[],
): BadRequestException =>
    new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { fields: collectViolations(errors) },
    });
