import { CODE_PATTERN } from './phone-code.ts';

const FIXED_CODE_ENVIRONMENT = 'lab';

export const fixedCodeFor = (
    environment: string | undefined,
    configured: string | undefined,
): string | null =>
    environment === FIXED_CODE_ENVIRONMENT &&
    configured !== undefined &&
    CODE_PATTERN.test(configured)
        ? configured
        : null;
