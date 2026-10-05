import type { ValidationError } from '@nestjs/common';
import { collectViolations } from '../../../src/shared/http/validation.ts';

describe('collectViolations', () => {
    it('collects nested paths and rule names', () => {
        const errors: ValidationError[] = [
            {
                property: 'email',
                constraints: { isEmail: 'email must be an email' },
            },
            {
                property: 'profile',
                children: [
                    {
                        property: 'name',
                        constraints: {
                            isString: 'name must be a string',
                            minLength: 'name is too short',
                        },
                    },
                ],
            },
            {
                property: 'courses',
                children: [
                    {
                        property: '0',
                        children: [
                            {
                                property: 'title',
                                constraints: {
                                    isNotEmpty: 'title should not be empty',
                                },
                            },
                        ],
                    },
                ],
            },
        ];

        expect(collectViolations(errors)).toEqual([
            { path: 'email', rules: ['isEmail'] },
            { path: 'profile.name', rules: ['isString', 'minLength'] },
            { path: 'courses.0.title', rules: ['isNotEmpty'] },
        ]);
    });
});
